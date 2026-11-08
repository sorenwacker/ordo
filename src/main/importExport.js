/**
 * Export and import of the full database contents.
 */

/**
 * Export all tables as a versioned payload.
 * @param {Object} db - better-sqlite3 database handle
 * @returns {Object} export payload with version, date, and per-table data
 */
export function exportData(db) {
  return {
    version: '2.0',
    exportDate: new Date().toISOString(),
    data: {
      projects: db.prepare('SELECT * FROM projects').all(),
      statuses: db.prepare('SELECT * FROM statuses').all(),
      todos: db.prepare('SELECT * FROM todos').all(),
      todoLinks: db.prepare('SELECT * FROM todo_links').all(),
      settings: db.prepare('SELECT * FROM settings').all(),
      milestoneTodos: db.prepare('SELECT * FROM milestone_todos').all(),
      projectTopics: db.prepare('SELECT * FROM project_topics').all(),
      tags: db.prepare('SELECT * FROM tags').all(),
      todoTags: db.prepare('SELECT * FROM todo_tags').all(),
      projectTags: db.prepare('SELECT * FROM project_tags').all()
    }
  }
}

/**
 * Import a payload produced by exportData.
 * @param {Object} db - better-sqlite3 database handle
 * @param {Object} importData - payload with a data property holding per-table rows
 * @param {string} mode - 'merge' keeps existing rows, 'replace' clears them first
 * @returns {boolean} true when the import transaction committed
 */
export function importData(db, importData, mode = 'merge') {
  if (!importData || !importData.data) {
    throw new Error('Invalid import data format')
  }

  // Version 1.0 payloads carry only these four collections; every other
  // collection defaults to empty and every missing todo column to null/0.
  const {
    projects,
    statuses,
    todos,
    todoLinks,
    settings,
    milestoneTodos,
    projectTopics,
    tags,
    todoTags,
    projectTags
  } = importData.data

  // Create a transaction for atomic import
  const transaction = db.transaction(() => {
    // If replace mode, clear existing data (children before parents)
    if (mode === 'replace') {
      for (const table of [
        'todo_tags',
        'project_tags',
        'tags',
        'milestone_todos',
        'todo_links',
        'todos',
        'project_topics',
        'statuses',
        'projects',
        'settings'
      ]) {
        db.prepare(`DELETE FROM ${table}`).run()
      }
    }

    // Maps to track old ID to new ID mappings
    const projectIdMap = new Map()
    const statusIdMap = new Map()
    const topicIdMap = new Map()
    const tagIdMap = new Map()
    const todoIdMap = new Map()

    // Import projects
    if (projects && projects.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO projects (name, color, notes, sort_order, created_at, deleted_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      projects.forEach((p) => {
        const result = stmt.run(
          p.name,
          p.color,
          p.notes ?? null,
          p.sort_order,
          p.created_at,
          p.deleted_at ?? null
        )
        projectIdMap.set(p.id, result.lastInsertRowid)
      })
    }

    // Import statuses
    if (statuses && statuses.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO statuses (name, color, sort_order, created_at)
        VALUES (?, ?, ?, ?)
      `)
      // Reuse an existing column with the same name, as tags do, so a merge
      // import does not double the seeded Todo/In Progress/Done/Backlog.
      const existingByName = new Map(
        db
          .prepare('SELECT id, name FROM statuses')
          .all()
          .map((row) => [row.name.trim().toLowerCase(), row.id])
      )
      statuses.forEach((s) => {
        const key = String(s.name ?? '')
          .trim()
          .toLowerCase()
        const existingId = existingByName.get(key)
        if (existingId !== undefined) {
          statusIdMap.set(s.id, existingId)
          return
        }
        const result = stmt.run(s.name, s.color, s.sort_order, s.created_at)
        statusIdMap.set(s.id, result.lastInsertRowid)
        existingByName.set(key, result.lastInsertRowid)
      })
    }

    // Import project topics
    if (projectTopics && projectTopics.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO project_topics (project_id, name, color, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      projectTopics.forEach((t) => {
        const newProjectId = projectIdMap.get(t.project_id)
        if (!newProjectId) return
        const result = stmt.run(newProjectId, t.name, t.color ?? null, t.sort_order, t.created_at)
        topicIdMap.set(t.id, result.lastInsertRowid)
      })
    }

    // Import tags, reusing existing rows with the same name
    if (tags && tags.length > 0) {
      const insert = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)')
      const select = db.prepare('SELECT id FROM tags WHERE name = ?')
      tags.forEach((t) => {
        insert.run(t.name)
        tagIdMap.set(t.id, select.get(t.name).id)
      })
    }

    // Import todos
    if (todos && todos.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO todos (title, notes, notes_sensitive, end_date, start_date, completed, completed_at, archived_at, sort_order, importance, project_id, status_id, topic_id, type, milestone_date, created_at, updated_at, deleted_at, recurrence_type, recurrence_interval, recurrence_end_date, deleted_project_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      todos.forEach((t) => {
        const newProjectId = t.project_id ? projectIdMap.get(t.project_id) : null
        const newStatusId = t.status_id ? statusIdMap.get(t.status_id) : null
        const newTopicId = t.topic_id ? topicIdMap.get(t.topic_id) : null

        const result = stmt.run(
          t.title,
          t.notes,
          t.notes_sensitive ?? 0,
          t.end_date,
          t.start_date,
          t.completed,
          t.completed_at ?? null,
          t.archived_at ?? null,
          t.sort_order,
          t.importance,
          newProjectId,
          newStatusId,
          newTopicId ?? null,
          t.type ?? 'todo',
          t.milestone_date ?? null,
          t.created_at,
          t.updated_at,
          t.deleted_at ?? null,
          t.recurrence_type,
          t.recurrence_interval ?? 1,
          t.recurrence_end_date,
          (t.deleted_project_id && projectIdMap.get(t.deleted_project_id)) ?? null
        )
        todoIdMap.set(t.id, result.lastInsertRowid)
      })

      // Second pass: parents can appear after their children in the export
      const setParent = db.prepare('UPDATE todos SET parent_id = ? WHERE id = ?')
      todos.forEach((t) => {
        if (!t.parent_id) return
        const newParentId = todoIdMap.get(t.parent_id)
        if (newParentId) setParent.run(newParentId, todoIdMap.get(t.id))
      })
    }

    // Import todo links
    if (todoLinks && todoLinks.length > 0) {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO todo_links (source_id, target_id, created_at)
        VALUES (?, ?, ?)
      `)
      todoLinks.forEach((l) => {
        const newSourceId = todoIdMap.get(l.source_id)
        const newTargetId = todoIdMap.get(l.target_id)
        if (newSourceId && newTargetId) {
          stmt.run(newSourceId, newTargetId, l.created_at)
        }
      })
    }

    // Import milestone-todo assignments
    if (milestoneTodos && milestoneTodos.length > 0) {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO milestone_todos (milestone_id, todo_id, created_at)
        VALUES (?, ?, ?)
      `)
      milestoneTodos.forEach((m) => {
        const newMilestoneId = todoIdMap.get(m.milestone_id)
        const newTodoId = todoIdMap.get(m.todo_id)
        if (newMilestoneId && newTodoId) {
          stmt.run(newMilestoneId, newTodoId, m.created_at)
        }
      })
    }

    // Import tag assignments
    if (todoTags && todoTags.length > 0) {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO todo_tags (todo_id, tag_id, created_at)
        VALUES (?, ?, ?)
      `)
      todoTags.forEach((tt) => {
        const newTodoId = todoIdMap.get(tt.todo_id)
        const newTagId = tagIdMap.get(tt.tag_id)
        if (newTodoId && newTagId) {
          stmt.run(newTodoId, newTagId, tt.created_at)
        }
      })
    }

    if (projectTags && projectTags.length > 0) {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO project_tags (project_id, tag_id, created_at)
        VALUES (?, ?, ?)
      `)
      projectTags.forEach((pt) => {
        const newProjectId = projectIdMap.get(pt.project_id)
        const newTagId = tagIdMap.get(pt.tag_id)
        if (newProjectId && newTagId) {
          stmt.run(newProjectId, newTagId, pt.created_at)
        }
      })
    }

    // Import settings; on merge the local value wins
    if (settings && settings.length > 0) {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO settings (key, value, updated_at)
        VALUES (?, ?, ?)
      `)
      settings.forEach((s) => {
        stmt.run(s.key, s.value, s.updated_at)
      })
    }
  })

  transaction()
  return true
}
