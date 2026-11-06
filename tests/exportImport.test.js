import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { unlinkSync, existsSync } from 'fs'
import { Database } from '../src/main/database.js'

// Exercises the real production Database class round trip: everything that
// exportData() writes must survive importData() into a fresh database.

function tmpDbPath() {
  return join(tmpdir(), `test-export-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

// Builds a database populated with at least one row in every user-data table
// and every todos column filled in.
function buildFixture(db) {
  const project = db.createProject('Alpha', '#e74c3c')
  db.updateProjectNotes(project.id, 'project context notes')
  const status = db.createStatus('Doing', '#3498db')

  db.db
    .prepare('INSERT INTO project_topics (project_id, name, color, sort_order) VALUES (?, ?, ?, ?)')
    .run(project.id, 'Backend', '#123456', 0)
  const topic = db.db.prepare('SELECT * FROM project_topics').get()

  const milestone = db.createTodo('Release', project.id, 'milestone')
  db.updateTodo({
    ...db.getTodo(milestone.id),
    milestone_date: '2026-08-01',
    notes: 'milestone notes'
  })

  const todo = db.createTodo('Secret task', project.id)
  db.updateTodo({
    ...db.getTodo(todo.id),
    notes: 'classified details',
    notes_sensitive: 1,
    status_id: status.id,
    topic_id: topic.id,
    parent_id: milestone.id,
    start_date: '2026-07-01',
    end_date: '2026-07-20',
    importance: 3,
    completed: 1,
    recurrence_type: 'weekly',
    recurrence_interval: 2,
    recurrence_end_date: '2026-12-31'
  })
  // updateTodo stamps completed_at itself, so pin it for a deterministic assert
  db.db
    .prepare('UPDATE todos SET completed_at = ? WHERE id = ?')
    .run('2026-07-10T12:00:00.000Z', todo.id)

  const archived = db.createTodo('Old task', project.id)
  db.archiveTodo(archived.id)

  db.linkTodos(milestone.id, todo.id)
  db.linkMilestoneTodo(milestone.id, todo.id)
  db.addTodoTag(todo.id, 'urgent')
  db.addProjectTag(project.id, 'work')
  db.setSetting('theme', 'dark')

  return { project, status, topic, milestone, todo, archived }
}

describe('exportData', () => {
  let db, dbPath

  beforeEach(() => {
    dbPath = tmpDbPath()
    db = new Database(dbPath)
  })

  afterEach(() => {
    db.close()
    if (existsSync(dbPath)) unlinkSync(dbPath)
  })

  it('exports every user-data table with version 2.0', () => {
    buildFixture(db)
    const payload = db.exportData()

    expect(payload.version).toBe('2.0')
    for (const key of [
      'projects',
      'statuses',
      'todos',
      'todoLinks',
      'settings',
      'milestoneTodos',
      'projectTopics',
      'tags',
      'todoTags',
      'projectTags'
    ]) {
      expect(payload.data[key], `data.${key}`).toBeDefined()
      expect(payload.data[key].length, `data.${key} rows`).toBeGreaterThan(0)
    }
  })

  it('exports all todo columns including the ones added by migrations', () => {
    const { todo } = buildFixture(db)
    const payload = db.exportData()
    const exported = payload.data.todos.find((t) => t.id === todo.id)

    expect(exported.notes_sensitive).toBe(1)
    expect(exported.type).toBe('todo')
    expect(exported.parent_id).not.toBeNull()
    expect(exported.topic_id).not.toBeNull()
    expect(exported.completed_at).toBe('2026-07-10T12:00:00.000Z')
    expect(exported.recurrence_type).toBe('weekly')
  })
})

describe('importData round trip', () => {
  let db1, db2, path1, path2

  beforeEach(() => {
    path1 = tmpDbPath()
    path2 = tmpDbPath()
    db1 = new Database(path1)
    db2 = new Database(path2)
  })

  afterEach(() => {
    db1.close()
    db2.close()
    for (const p of [path1, path2]) if (existsSync(p)) unlinkSync(p)
  })

  it('preserves every todo field and every table across a merge import', () => {
    buildFixture(db1)
    const payload = db1.exportData()
    db2.importData(payload, 'merge')

    const project = db2.db.prepare("SELECT * FROM projects WHERE name = 'Alpha'").get()
    expect(project.notes).toBe('project context notes')

    const milestone = db2.db.prepare("SELECT * FROM todos WHERE title = 'Release'").get()
    expect(milestone.type).toBe('milestone')
    expect(milestone.milestone_date).toBe('2026-08-01')

    const todo = db2.db.prepare("SELECT * FROM todos WHERE title = 'Secret task'").get()
    expect(todo.notes_sensitive).toBe(1)
    expect(todo.parent_id).toBe(milestone.id)
    expect(todo.project_id).toBe(project.id)
    expect(todo.completed_at).toBe('2026-07-10T12:00:00.000Z')
    expect(todo.recurrence_type).toBe('weekly')
    expect(todo.recurrence_interval).toBe(2)
    expect(todo.recurrence_end_date).toBe('2026-12-31')
    expect(todo.start_date).toBe('2026-07-01')
    expect(todo.end_date).toBe('2026-07-20')
    expect(todo.importance).toBe(3)

    const topic = db2.db.prepare('SELECT * FROM project_topics').get()
    expect(topic.name).toBe('Backend')
    expect(topic.project_id).toBe(project.id)
    expect(todo.topic_id).toBe(topic.id)

    const archived = db2.db.prepare("SELECT * FROM todos WHERE title = 'Old task'").get()
    expect(archived.archived_at).not.toBeNull()

    expect(db2.db.prepare('SELECT COUNT(*) AS n FROM todo_links').get().n).toBe(1)
    const ml = db2.db.prepare('SELECT * FROM milestone_todos').get()
    expect(ml.milestone_id).toBe(milestone.id)
    expect(ml.todo_id).toBe(todo.id)

    expect(db2.getTodoTags(todo.id).map((t) => t.name)).toEqual(['urgent'])
    expect(db2.getProjectTags(project.id).map((t) => t.name)).toEqual(['work'])
    expect(db2.getSetting('theme')).toBe('dark')
  })

  it('clears all imported tables first in replace mode', () => {
    buildFixture(db1)
    buildFixture(db2)
    db2.setSetting('theme', 'light')

    db2.importData(db1.exportData(), 'replace')

    expect(db2.db.prepare('SELECT COUNT(*) AS n FROM projects').get().n).toBe(1)
    expect(db2.db.prepare('SELECT COUNT(*) AS n FROM todos').get().n).toBe(3)
    expect(db2.db.prepare('SELECT COUNT(*) AS n FROM tags').get().n).toBe(2)
    expect(db2.db.prepare('SELECT COUNT(*) AS n FROM milestone_todos').get().n).toBe(1)
    expect(db2.db.prepare('SELECT COUNT(*) AS n FROM project_topics').get().n).toBe(1)
    expect(db2.getSetting('theme')).toBe('dark')
  })

  it('reuses existing status columns by name on merge', () => {
    const before = db2.getAllStatuses().length
    const done = db1.getAllStatuses().find((st) => st.name === 'Done')
    const todo = db1.createTodo('In done column', null)
    db1.updateTodo({ ...db1.getTodo(todo.id), status_id: done.id })

    db2.importData(db1.exportData(), 'merge')

    expect(db2.getAllStatuses()).toHaveLength(before)
    const imported = db2.db.prepare("SELECT * FROM todos WHERE title = 'In done column'").get()
    expect(db2.getStatus(imported.status_id).name).toBe('Done')
  })

  it('keeps local settings on merge', () => {
    buildFixture(db1)
    db2.setSetting('theme', 'light')

    db2.importData(db1.exportData(), 'merge')

    expect(db2.getSetting('theme')).toBe('light')
  })

  it('imports a version 1.0 payload with sensible defaults', () => {
    const v1 = {
      version: '1.0',
      exportDate: '2026-01-01T00:00:00.000Z',
      data: {
        projects: [{ id: 1, name: 'Legacy', color: '#111111', sort_order: 0, created_at: 'x' }],
        statuses: [{ id: 1, name: 'Open', color: '#222222', sort_order: 0, created_at: 'x' }],
        todos: [
          {
            id: 1,
            title: 'Old todo',
            notes: 'n',
            end_date: null,
            start_date: null,
            completed: 0,
            sort_order: 0,
            importance: 0,
            project_id: 1,
            status_id: 1,
            created_at: 'x',
            updated_at: 'x',
            deleted_at: null,
            recurrence_type: null,
            recurrence_interval: 1,
            recurrence_end_date: null
          }
        ],
        todoLinks: []
      }
    }

    db2.importData(v1, 'merge')

    const todo = db2.db.prepare("SELECT * FROM todos WHERE title = 'Old todo'").get()
    expect(todo.type).toBe('todo')
    expect(todo.notes_sensitive).toBe(0)
    expect(todo.archived_at).toBeNull()
    expect(todo.project_id).not.toBeNull()
  })

  it('reuses existing tags by name on merge without duplicating them', () => {
    buildFixture(db1)
    db2.createTag('urgent')

    db2.importData(db1.exportData(), 'merge')

    const tags = db2.db.prepare("SELECT * FROM tags WHERE name = 'urgent'").all()
    expect(tags.length).toBe(1)
    const todo = db2.db.prepare("SELECT * FROM todos WHERE title = 'Secret task'").get()
    expect(db2.getTodoTags(todo.id).map((t) => t.name)).toContain('urgent')
  })
})
