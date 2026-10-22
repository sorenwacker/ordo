import BetterSqlite3 from 'better-sqlite3'
// Default import: under plain Node (MCP server, tests) electron's CJS export
// is a path string with no named exports; `app` is only touched when no
// explicit dbPath is given, which only happens inside the Electron app.
import electron from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, renameSync, copyFileSync } from 'fs'
import log from './logger.js'
import { createTables, runMigrations, verifySchema, SCHEMA_VERSION } from './schema.js'
import { exportData, importData } from './importExport.js'

export class Database {
  /**
   * @param {string|null} dbPath - Database file; null resolves the app default.
   * @param {Object} [options]
   * @param {Function} [options.driver] - better-sqlite3 constructor to use.
   *   The MCP server injects its own copy built for system Node, because the
   *   root node_modules copy is rebuilt for Electron's ABI by dev/build.
   */
  constructor(dbPath = null, { driver } = {}) {
    this.BetterSqlite3 = driver || BetterSqlite3
    if (!dbPath) {
      const userDataPath = electron.app.getPath('userData')
      if (!existsSync(userDataPath)) {
        mkdirSync(userDataPath, { recursive: true })
      }
      dbPath = join(userDataPath, 'todos.db')
    }

    this.dbPath = dbPath
    const isNewDatabase = !existsSync(dbPath)
    this.db = new this.BetterSqlite3(dbPath)
    try {
      this.init(isNewDatabase)
    } catch (error) {
      this.db.close()
      throw error
    }
  }

  /**
   * Open sequence: refuse databases from newer app versions, migrate older
   * ones behind a pre-migration backup, verify the schema, and stamp the
   * file with the current version. See docs/database-compatibility.md.
   *
   * @param {boolean} isNewDatabase - True when the file did not exist before
   *   this open; skips the pre-migration backup.
   */
  init(isNewDatabase = false) {
    // WAL + busy timeout so the app and the MCP server can share the file
    // (see docs/mcp-server.md). journal_mode persists in the file.
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('busy_timeout = 5000')

    const fileVersion = this.db.pragma('user_version', { simple: true })
    if (fileVersion > SCHEMA_VERSION) {
      throw new Error(
        `This database was created by a newer version of the app ` +
          `(schema version ${fileVersion}, this app supports up to ${SCHEMA_VERSION}). ` +
          'Update the app to open it.'
      )
    }

    if (fileVersion < SCHEMA_VERSION) {
      let backupPath = null
      if (!isNewDatabase) {
        backupPath = this.timestampedSiblingPath('premigrate')
        // Fold WAL content into the main file so the copy is complete
        this.db.pragma('wal_checkpoint(TRUNCATE)')
        copyFileSync(this.dbPath, backupPath)
        log.info('Pre-migration backup created', { backupPath })
      }
      try {
        createTables(this.db)
        runMigrations(this.db, log)
        verifySchema(this.db)
      } catch (error) {
        if (backupPath) {
          error.message += ` (pre-migration backup: ${backupPath})`
        }
        throw error
      }
      this.db.pragma(`user_version = ${SCHEMA_VERSION}`)
    } else {
      verifySchema(this.db)
    }

    // Seed default statuses if none exist
    const statusCount = this.db.prepare('SELECT COUNT(*) as count FROM statuses').get().count
    if (statusCount === 0) {
      const defaultStatuses = [
        { name: 'Todo', color: '#d93025', sort_order: 0 },
        { name: 'In Progress', color: '#ef6c00', sort_order: 1 },
        { name: 'Done', color: '#0f9d58', sort_order: 2 },
        { name: 'Backlog', color: '#1a73e8', sort_order: 3 }
      ]
      const stmt = this.db.prepare(
        'INSERT INTO statuses (name, color, sort_order) VALUES (?, ?, ?)'
      )
      defaultStatuses.forEach((s) => stmt.run(s.name, s.color, s.sort_order))
    }
  }

  // Project operations
  getAllProjects() {
    return this.db
      .prepare('SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY sort_order ASC')
      .all()
  }

  getDeletedProjects() {
    return this.db
      .prepare('SELECT * FROM projects WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')
      .all()
  }

  getProject(id) {
    return this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
  }

  createProject(name, color = '#0f4c75') {
    const maxOrder = this.db.prepare('SELECT MAX(sort_order) as max FROM projects').get()
    const sortOrder = (maxOrder.max || 0) + 1

    const result = this.db
      .prepare('INSERT INTO projects (name, color, sort_order) VALUES (?, ?, ?)')
      .run(name, color, sortOrder)

    return this.getProject(result.lastInsertRowid)
  }

  updateProject(project) {
    this.db
      .prepare('UPDATE projects SET name = ?, color = ? WHERE id = ?')
      .run(project.name, project.color, project.id)

    return this.getProject(project.id)
  }

  updateProjectNotes(id, notes) {
    this.db.prepare('UPDATE projects SET notes = ? WHERE id = ?').run(notes, id)
    return this.getProject(id)
  }

  deleteProject(id) {
    // Move all todos in this project to inbox (no project)
    this.db.prepare('UPDATE todos SET project_id = NULL WHERE project_id = ?').run(id)

    // Soft delete: set deleted_at timestamp
    this.db.prepare('UPDATE projects SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(id)
    return true
  }

  restoreProject(id) {
    this.db.prepare('UPDATE projects SET deleted_at = NULL WHERE id = ?').run(id)
    return this.getProject(id)
  }

  permanentlyDeleteProject(id) {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    return true
  }

  // Status operations
  getAllStatuses() {
    return this.db.prepare('SELECT * FROM statuses ORDER BY sort_order ASC').all()
  }

  getStatus(id) {
    return this.db.prepare('SELECT * FROM statuses WHERE id = ?').get(id)
  }

  createStatus(name, color = '#3498db') {
    const maxOrder = this.db.prepare('SELECT MAX(sort_order) as max FROM statuses').get()
    const sortOrder = (maxOrder.max || 0) + 1

    const result = this.db
      .prepare('INSERT INTO statuses (name, color, sort_order) VALUES (?, ?, ?)')
      .run(name, color, sortOrder)

    return this.getStatus(result.lastInsertRowid)
  }

  updateStatus(status) {
    this.db
      .prepare('UPDATE statuses SET name = ?, color = ? WHERE id = ?')
      .run(status.name, status.color, status.id)

    return this.getStatus(status.id)
  }

  deleteStatus(id) {
    this.db.prepare('DELETE FROM statuses WHERE id = ?').run(id)
    return true
  }

  // Todo operations
  getAllTodos(projectId = null) {
    if (projectId === null) {
      return this.db
        .prepare(
          `
        SELECT t.*, p.name as project_name, p.color as project_color,
               s.name as status_name, s.color as status_color
        FROM todos t
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN statuses s ON t.status_id = s.id
        WHERE t.deleted_at IS NULL AND t.archived_at IS NULL
        ORDER BY t.sort_order ASC, t.created_at DESC
      `
        )
        .all()
    } else if (projectId === 'inbox') {
      return this.db
        .prepare(
          `
        SELECT t.*, NULL as project_name, NULL as project_color,
               s.name as status_name, s.color as status_color
        FROM todos t
        LEFT JOIN statuses s ON t.status_id = s.id
        WHERE t.project_id IS NULL AND t.deleted_at IS NULL AND t.archived_at IS NULL
        ORDER BY t.sort_order ASC, t.created_at DESC
      `
        )
        .all()
    } else if (projectId === 'archive') {
      return this.getArchivedTodos()
    } else if (projectId === 'trash') {
      return this.db
        .prepare(
          `
        SELECT t.*, p.name as project_name, p.color as project_color,
               s.name as status_name, s.color as status_color
        FROM todos t
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN statuses s ON t.status_id = s.id
        WHERE t.deleted_at IS NOT NULL
        ORDER BY t.deleted_at DESC
      `
        )
        .all()
    } else {
      return this.db
        .prepare(
          `
        SELECT t.*, p.name as project_name, p.color as project_color,
               s.name as status_name, s.color as status_color
        FROM todos t
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN statuses s ON t.status_id = s.id
        WHERE t.project_id = ? AND t.deleted_at IS NULL AND t.archived_at IS NULL
        ORDER BY t.sort_order ASC, t.created_at DESC
      `
        )
        .all(projectId)
    }
  }

  getTodo(id) {
    return this.db
      .prepare(
        `
      SELECT t.*, p.name as project_name, p.color as project_color,
             s.name as status_name, s.color as status_color
      FROM todos t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN statuses s ON t.status_id = s.id
      WHERE t.id = ?
    `
      )
      .get(id)
  }

  createTodo(title, projectId = null, type = 'todo') {
    // Insert at top (lowest sort_order)
    const minOrder = this.db.prepare('SELECT MIN(sort_order) as min FROM todos').get()
    const sortOrder = (minOrder.min || 0) - 1

    const result = this.db
      .prepare(
        `
      INSERT INTO todos (title, sort_order, project_id, importance, type) VALUES (?, ?, ?, NULL, ?)
    `
      )
      .run(title, sortOrder, projectId, type)

    return this.getTodo(result.lastInsertRowid)
  }

  updateTodo(todo) {
    // Convert empty strings to null for dates
    const endDate = todo.end_date && todo.end_date.trim() !== '' ? todo.end_date : null
    const startDate = todo.start_date && todo.start_date.trim() !== '' ? todo.start_date : null
    const importance = todo.importance != null ? todo.importance : null
    const recurrenceType =
      todo.recurrence_type && todo.recurrence_type.trim() !== '' ? todo.recurrence_type : null
    const recurrenceInterval = todo.recurrence_interval || 1
    const notesSensitive = todo.notes_sensitive ? 1 : 0
    const type = todo.type || 'todo'
    const topicId = todo.topic_id !== undefined ? todo.topic_id : null

    // Set completed_at when completing, clear when uncompleting
    const existingTodo = this.getTodo(todo.id)
    let completedAt = existingTodo?.completed_at || null
    if (todo.completed && !existingTodo?.completed) {
      completedAt = new Date().toISOString()
    } else if (!todo.completed) {
      completedAt = null
    }

    // Preserve parent_id / milestone_date / recurrence_end_date when the caller
    // omits them, so a generic update does not clear a todo's milestone
    // assignment or make a recurring todo recur forever.
    const parentId =
      todo.parent_id !== undefined ? todo.parent_id : (existingTodo?.parent_id ?? null)
    const recurrenceEndDate =
      todo.recurrence_end_date !== undefined
        ? todo.recurrence_end_date && todo.recurrence_end_date.trim() !== ''
          ? todo.recurrence_end_date
          : null
        : (existingTodo?.recurrence_end_date ?? null)
    const milestoneDate =
      todo.milestone_date !== undefined
        ? todo.milestone_date && todo.milestone_date.trim() !== ''
          ? todo.milestone_date
          : null
        : (existingTodo?.milestone_date ?? null)

    this.db
      .prepare(
        `
      UPDATE todos
      SET title = ?, notes = ?, end_date = ?, start_date = ?, completed = ?, completed_at = ?, project_id = ?, status_id = ?, importance = ?, recurrence_type = ?, recurrence_interval = ?, recurrence_end_date = ?, notes_sensitive = ?, type = ?, topic_id = ?, parent_id = ?, milestone_date = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `
      )
      .run(
        todo.title,
        todo.notes || '',
        endDate,
        startDate,
        todo.completed ? 1 : 0,
        completedAt,
        todo.project_id || null,
        todo.status_id || null,
        importance,
        recurrenceType,
        recurrenceInterval,
        recurrenceEndDate,
        notesSensitive,
        type,
        topicId,
        parentId,
        milestoneDate,
        todo.id
      )

    return this.getTodo(todo.id)
  }

  // Create next recurring todo instance when completing a recurring task
  createNextRecurrence(todoId) {
    const todo = this.getTodo(todoId)
    if (!todo || !todo.recurrence_type) return null

    // Calculate next due date
    const baseDate = todo.end_date ? new Date(todo.end_date) : new Date()
    const interval = todo.recurrence_interval || 1

    let nextDate = new Date(baseDate)
    switch (todo.recurrence_type) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + interval)
        break
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + interval * 7)
        break
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + interval)
        break
      case 'yearly':
        nextDate.setFullYear(nextDate.getFullYear() + interval)
        break
      default:
        return null
    }

    // Check if recurrence end date has passed
    if (todo.recurrence_end_date) {
      const endDate = new Date(todo.recurrence_end_date)
      if (nextDate > endDate) return null
    }

    const nextDateStr = nextDate.toISOString().split('T')[0]

    // Calculate next start date if original had one
    let nextStartDate = null
    if (todo.start_date && todo.end_date) {
      const startDate = new Date(todo.start_date)
      const endDateObj = new Date(todo.end_date)
      const duration = endDateObj - startDate
      const newStartDate = new Date(nextDate - duration)
      nextStartDate = newStartDate.toISOString().split('T')[0]
    }

    // Create new todo with same properties but new dates
    const maxOrder = this.db.prepare('SELECT MAX(sort_order) as max FROM todos').get()
    const sortOrder = (maxOrder.max || 0) + 1

    const result = this.db
      .prepare(
        `
      INSERT INTO todos (title, notes, end_date, start_date, completed, sort_order, importance, project_id, status_id, recurrence_type, recurrence_interval, recurrence_end_date, type, topic_id, notes_sensitive, parent_id, milestone_date)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        todo.title,
        todo.notes || '',
        nextDateStr,
        nextStartDate,
        sortOrder,
        todo.importance,
        todo.project_id,
        todo.status_id,
        todo.recurrence_type,
        todo.recurrence_interval,
        todo.recurrence_end_date,
        todo.type || 'todo',
        todo.topic_id ?? null,
        todo.notes_sensitive ? 1 : 0,
        todo.parent_id ?? null,
        todo.milestone_date ?? null
      )

    return this.getTodo(result.lastInsertRowid)
  }

  deleteTodo(id) {
    // Soft delete: set deleted_at timestamp
    this.db.prepare('UPDATE todos SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(id)
    return true
  }

  restoreTodo(id) {
    this.db.prepare('UPDATE todos SET deleted_at = NULL WHERE id = ?').run(id)
    return this.getTodo(id)
  }

  archiveTodo(id) {
    this.db.prepare('UPDATE todos SET archived_at = CURRENT_TIMESTAMP WHERE id = ?').run(id)
    return true
  }

  getCompletedTodoIds(projectId = null) {
    let sql =
      'SELECT id FROM todos WHERE completed = 1 AND archived_at IS NULL AND deleted_at IS NULL'
    const params = []
    if (projectId === 'inbox') {
      sql += ' AND project_id IS NULL'
    } else if (projectId !== null && typeof projectId === 'number') {
      sql += ' AND project_id = ?'
      params.push(projectId)
    }
    return this.db
      .prepare(sql)
      .all(...params)
      .map((r) => r.id)
  }

  archiveCompletedTodos(projectId = null) {
    let sql =
      'UPDATE todos SET archived_at = CURRENT_TIMESTAMP WHERE completed = 1 AND archived_at IS NULL AND deleted_at IS NULL'
    const params = []
    if (projectId === 'inbox') {
      sql += ' AND project_id IS NULL'
    } else if (projectId !== null && typeof projectId === 'number') {
      sql += ' AND project_id = ?'
      params.push(projectId)
    }
    const result = this.db.prepare(sql).run(...params)
    return result.changes
  }

  unarchiveTodo(id) {
    this.db.prepare('UPDATE todos SET archived_at = NULL WHERE id = ?').run(id)
    return this.getTodo(id)
  }

  getArchivedTodos() {
    return this.db
      .prepare(
        `
      SELECT t.*, p.name as project_name, p.color as project_color,
             s.name as status_name, s.color as status_color
      FROM todos t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN statuses s ON t.status_id = s.id
      WHERE t.archived_at IS NOT NULL AND t.deleted_at IS NULL
      ORDER BY t.archived_at DESC
    `
      )
      .all()
  }

  getArchiveCount() {
    const result = this.db
      .prepare(
        'SELECT COUNT(*) as count FROM todos WHERE archived_at IS NOT NULL AND deleted_at IS NULL'
      )
      .get()
    return result.count
  }

  permanentlyDeleteTodo(id) {
    this.db.prepare('DELETE FROM todos WHERE id = ?').run(id)
    return true
  }

  emptyTrash() {
    this.db.prepare('DELETE FROM todos WHERE deleted_at IS NOT NULL').run()
    return true
  }

  getTrashCount() {
    const result = this.db
      .prepare('SELECT COUNT(*) as count FROM todos WHERE deleted_at IS NOT NULL')
      .get()
    return result.count
  }

  // Milestone operations
  reorderTodos(ids) {
    const stmt = this.db.prepare('UPDATE todos SET sort_order = ? WHERE id = ?')
    const transaction = this.db.transaction((ids) => {
      ids.forEach((id, index) => {
        stmt.run(index, id)
      })
    })
    transaction(ids)
    return true
  }

  reorderProjects(ids) {
    const stmt = this.db.prepare('UPDATE projects SET sort_order = ? WHERE id = ?')
    const transaction = this.db.transaction((ids) => {
      ids.forEach((id, index) => {
        stmt.run(index, id)
      })
    })
    transaction(ids)
    return true
  }

  reorderStatuses(ids) {
    const stmt = this.db.prepare('UPDATE statuses SET sort_order = ? WHERE id = ?')
    const transaction = this.db.transaction((ids) => {
      ids.forEach((id, index) => {
        stmt.run(index, id)
      })
    })
    transaction(ids)
    return true
  }

  // Link operations
  getLinkedTodos(todoId) {
    return this.db
      .prepare(
        `
      SELECT t.*, p.name as project_name, p.color as project_color,
             s.name as status_name, s.color as status_color
      FROM todos t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN statuses s ON t.status_id = s.id
      WHERE t.id IN (
        SELECT target_id FROM todo_links WHERE source_id = ?
        UNION
        SELECT source_id FROM todo_links WHERE target_id = ?
      )
    `
      )
      .all(todoId, todoId)
  }

  linkTodos(sourceId, targetId) {
    if (sourceId === targetId) return false

    // Ensure consistent ordering to avoid duplicates
    const [first, second] = sourceId < targetId ? [sourceId, targetId] : [targetId, sourceId]

    try {
      this.db
        .prepare('INSERT OR IGNORE INTO todo_links (source_id, target_id) VALUES (?, ?)')
        .run(first, second)
      return true
    } catch (error) {
      log.warn('Failed to link todos', { sourceId, targetId, error: error.message })
      return false
    }
  }

  unlinkTodos(sourceId, targetId) {
    const [first, second] = sourceId < targetId ? [sourceId, targetId] : [targetId, sourceId]
    this.db
      .prepare('DELETE FROM todo_links WHERE source_id = ? AND target_id = ?')
      .run(first, second)
    return true
  }

  // Search todos for linking
  searchTodos(query, excludeId = null) {
    if (excludeId) {
      return this.db
        .prepare(
          `
        SELECT t.*, p.name as project_name, p.color as project_color,
               s.name as status_name, s.color as status_color
        FROM todos t
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN statuses s ON t.status_id = s.id
        WHERE t.title LIKE ? AND t.id != ? AND t.deleted_at IS NULL
        LIMIT 10
      `
        )
        .all(`%${query}%`, excludeId)
    }
    return this.db
      .prepare(
        `
      SELECT t.*, p.name as project_name, p.color as project_color,
             s.name as status_name, s.color as status_color
      FROM todos t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN statuses s ON t.status_id = s.id
      WHERE t.title LIKE ? AND t.deleted_at IS NULL
      LIMIT 10
    `
      )
      .all(`%${query}%`)
  }

  // Global search across todos, projects, and tags
  globalSearch(query, limit = 20) {
    const searchTerm = `%${query}%`

    // Search todos (title + notes + tags)
    const todos = this.db
      .prepare(
        `
      SELECT DISTINCT t.*, p.name as project_name, p.color as project_color,
             s.name as status_name, s.color as status_color
      FROM todos t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN statuses s ON t.status_id = s.id
      LEFT JOIN todo_tags tt ON t.id = tt.todo_id
      LEFT JOIN tags tg ON tt.tag_id = tg.id
      WHERE (t.title LIKE ? OR t.notes LIKE ? OR tg.name LIKE ?) AND t.deleted_at IS NULL
      LIMIT ?
    `
      )
      .all(searchTerm, searchTerm, searchTerm, limit)

    // Search projects (name + tags)
    const projects = this.db
      .prepare(
        `
      SELECT DISTINCT pr.*
      FROM projects pr
      LEFT JOIN project_tags prt ON pr.id = prt.project_id
      LEFT JOIN tags tg ON prt.tag_id = tg.id
      WHERE (pr.name LIKE ? OR tg.name LIKE ?) AND pr.deleted_at IS NULL
      LIMIT ?
    `
      )
      .all(searchTerm, searchTerm, limit)

    // Search tags directly
    const tags = this.db
      .prepare(
        `
      SELECT * FROM tags WHERE name LIKE ? LIMIT ?
    `
      )
      .all(searchTerm, limit)

    return { todos, projects, tags }
  }

  // Settings operations
  getSetting(key) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    if (!row) return null
    try {
      return JSON.parse(row.value)
    } catch (error) {
      log.warn('Failed to parse setting value as JSON, returning raw string', {
        key,
        error: error.message
      })
      return row.value
    }
  }

  setSetting(key, value) {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value)
    this.db
      .prepare(
        `
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
    `
      )
      .run(key, stringValue, stringValue)
    return this.getSetting(key)
  }

  getAllSettings() {
    const rows = this.db.prepare('SELECT key, value FROM settings').all()
    const settings = {}
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value)
      } catch (error) {
        log.warn('Failed to parse setting value as JSON, using raw string', {
          key: row.key,
          error: error.message
        })
        settings[row.key] = row.value
      }
    }
    return settings
  }

  // Milestone operations
  linkMilestoneTodo(milestoneId, todoId) {
    this.db
      .prepare(
        `
      INSERT OR IGNORE INTO milestone_todos (milestone_id, todo_id)
      VALUES (?, ?)
    `
      )
      .run(milestoneId, todoId)
    return true
  }

  // Tag operations
  getAllTags() {
    return this.db.prepare('SELECT * FROM tags ORDER BY name ASC').all()
  }

  getTag(id) {
    return this.db.prepare('SELECT * FROM tags WHERE id = ?').get(id)
  }

  getTagByName(name) {
    return this.db.prepare('SELECT * FROM tags WHERE name = ?').get(name)
  }

  createTag(name) {
    const existing = this.getTagByName(name)
    if (existing) return existing

    const result = this.db.prepare('INSERT INTO tags (name) VALUES (?)').run(name)
    return this.getTag(result.lastInsertRowid)
  }

  // Todo-Tag operations
  getTodoTags(todoId) {
    return this.db
      .prepare(
        `
      SELECT t.* FROM tags t
      INNER JOIN todo_tags tt ON t.id = tt.tag_id
      WHERE tt.todo_id = ?
      ORDER BY t.name ASC
    `
      )
      .all(todoId)
  }

  addTodoTag(todoId, tagName) {
    const tag = this.createTag(tagName)
    try {
      this.db
        .prepare('INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)')
        .run(todoId, tag.id)
    } catch (error) {
      log.warn('Failed to add tag to todo', { todoId, tagName, error: error.message })
    }
    return tag
  }

  removeTodoTag(todoId, tagId) {
    this.db.prepare('DELETE FROM todo_tags WHERE todo_id = ? AND tag_id = ?').run(todoId, tagId)
    this.cleanupOrphanedTag(tagId)
    return true
  }

  // Delete tag if it has no associations
  cleanupOrphanedTag(tagId) {
    const count = this.db
      .prepare(
        `
      SELECT (SELECT COUNT(*) FROM todo_tags WHERE tag_id = ?) +
             (SELECT COUNT(*) FROM project_tags WHERE tag_id = ?) as total
    `
      )
      .get(tagId, tagId)
    if (count.total === 0) {
      this.db.prepare('DELETE FROM tags WHERE id = ?').run(tagId)
    }
  }

  // Project-Tag operations
  getProjectTags(projectId) {
    return this.db
      .prepare(
        `
      SELECT t.* FROM tags t
      INNER JOIN project_tags pt ON t.id = pt.tag_id
      WHERE pt.project_id = ?
      ORDER BY t.name ASC
    `
      )
      .all(projectId)
  }

  addProjectTag(projectId, tagName) {
    const tag = this.createTag(tagName)
    try {
      this.db
        .prepare('INSERT OR IGNORE INTO project_tags (project_id, tag_id) VALUES (?, ?)')
        .run(projectId, tag.id)
    } catch (error) {
      log.warn('Failed to add tag to project', { projectId, tagName, error: error.message })
    }
    return tag
  }

  removeProjectTag(projectId, tagId) {
    this.db
      .prepare('DELETE FROM project_tags WHERE project_id = ? AND tag_id = ?')
      .run(projectId, tagId)
    this.cleanupOrphanedTag(tagId)
    return true
  }

  // Export/Import operations
  exportData() {
    return exportData(this.db)
  }

  importData(data, mode = 'merge') {
    return importData(this.db, data, mode)
  }

  /**
   * Replace the database with a freshly created one, keeping the current
   * file as a timestamped backup next to it.
   *
   * @returns {string} Path of the backup file.
   * @throws {Error} When the current file cannot be moved aside; the
   *   original database is reopened before rethrowing.
   */
  /**
   * Build a sibling file path of the form <name>-<label>-YYMMDD-HHMMSS.db.
   *
   * @param {string} label - Purpose marker, e.g. "backup" or "premigrate".
   * @returns {string} The timestamped path next to the database file.
   */
  timestampedSiblingPath(label) {
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const stamp =
      `${String(now.getFullYear()).slice(2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
      `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    return `${this.dbPath.replace(/\.db$/, '')}-${label}-${stamp}.db`
  }

  reset() {
    const backupPath = this.timestampedSiblingPath('backup')

    this.db.close()
    try {
      renameSync(this.dbPath, backupPath)
      for (const suffix of ['-wal', '-shm']) {
        if (existsSync(this.dbPath + suffix)) {
          renameSync(this.dbPath + suffix, backupPath + suffix)
        }
      }
    } catch (error) {
      this.db = new this.BetterSqlite3(this.dbPath)
      throw error
    }

    this.db = new this.BetterSqlite3(this.dbPath)
    this.init(true)
    log.info('Database reset', { backupPath })
    return backupPath
  }

  /**
   * SQLite's data_version for this connection.
   *
   * The value changes when another connection commits to the database and
   * stays the same across this connection's own commits, which makes it a
   * cheap signal for writes made by the MCP server (see docs/mcp-server.md).
   *
   * @returns {number} Current data_version.
   */
  getDataVersion() {
    return this.db.pragma('data_version', { simple: true })
  }

  close() {
    this.db.close()
  }
}
