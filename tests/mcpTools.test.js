import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { unlinkSync, existsSync } from 'fs'
import { Database } from '../src/main/database.js'
import { createTools } from '../mcp-server/tools.js'

// Exercises the MCP tool handlers (mcp-server/tools.js) directly against a
// real Database, without any MCP transport.

describe('MCP tools', () => {
  let db
  let testDbPath
  let tools

  const tool = (name) => tools.find((t) => t.name === name).handler

  beforeEach(() => {
    testDbPath = join(tmpdir(), `test-mcp-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
    db = new Database(testDbPath)
    tools = createTools(db)
  })

  afterEach(() => {
    db.close()
    for (const suffix of ['', '-wal', '-shm']) {
      if (existsSync(testDbPath + suffix)) {
        unlinkSync(testDbPath + suffix)
      }
    }
  })

  describe('list_projects', () => {
    it('lists active projects', () => {
      db.createProject('Career', '#0f9d58')
      const projects = tool('list_projects')()
      expect(projects).toEqual([{ id: 1, name: 'Career', color: '#0f9d58' }])
    })
  })

  describe('add_todo', () => {
    it('creates a todo in the inbox with a default start date', () => {
      const todo = tool('add_todo')({ title: 'Call the bank' })
      expect(todo.title).toBe('Call the bank')
      expect(todo.project).toBeNull()
      expect(todo.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(todo.completed).toBe(false)
    })

    it('resolves project and status by name', () => {
      db.createProject('Career')
      const todo = tool('add_todo')({
        title: 'Update CV',
        project: 'career',
        status: 'in progress',
        notes: 'Two versions',
        importance: 4
      })
      expect(todo.project).toBe('Career')
      expect(todo.status).toBe('In Progress')
      expect(todo.notes).toBe('Two versions')
      expect(todo.importance).toBe(4)
    })

    it('rejects a missing title', () => {
      expect(() => tool('add_todo')({ title: '   ' })).toThrow(/title is required/)
    })

    it('rejects an overlong title', () => {
      expect(() => tool('add_todo')({ title: 'x'.repeat(501) })).toThrow(/maximum length/)
    })

    it('rejects an unknown project instead of creating it', () => {
      expect(() => tool('add_todo')({ title: 'T', project: 'Nope' })).toThrow(/Unknown project/)
      expect(tool('list_todos')()).toHaveLength(0)
    })

    it('rejects an unknown status and names the known ones', () => {
      expect(() => tool('add_todo')({ title: 'T', status: 'Nope' })).toThrow(/Known statuses/)
    })

    it('rejects an out-of-range importance', () => {
      expect(() => tool('add_todo')({ title: 'T', importance: 9 })).toThrow(/between 1 and 5/)
    })

    it('leaves no todo behind when importance is invalid', () => {
      expect(() => tool('add_todo')({ title: 'T', importance: 2.5 })).toThrow()
      expect(db.getAllTodos()).toHaveLength(0)
    })
  })

  describe('list_todos', () => {
    it('excludes completed todos by default and includes them on request', () => {
      const a = tool('add_todo')({ title: 'Open task' })
      const b = tool('add_todo')({ title: 'Done task' })
      tool('complete_todo')({ id: b.id })

      const open = tool('list_todos')()
      expect(open.map((t) => t.id)).toEqual([a.id])

      const all = tool('list_todos')({ include_completed: true })
      expect(all).toHaveLength(2)
    })

    it('filters by project and status', () => {
      db.createProject('Career')
      tool('add_todo')({ title: 'In career', project: 'Career', status: 'Todo' })
      tool('add_todo')({ title: 'Elsewhere' })

      const byProject = tool('list_todos')({ project: 'Career' })
      expect(byProject).toHaveLength(1)
      expect(byProject[0].title).toBe('In career')

      const byStatus = tool('list_todos')({ status: 'Todo' })
      expect(byStatus).toHaveLength(1)
    })
  })

  describe('update_todo', () => {
    it('updates only the given fields', () => {
      db.createProject('Career')
      const todo = tool('add_todo')({ title: 'Original', notes: 'keep me' })
      const updated = tool('update_todo')({ id: todo.id, title: 'Renamed', project: 'Career' })
      expect(updated.title).toBe('Renamed')
      expect(updated.notes).toBe('keep me')
      expect(updated.project).toBe('Career')
    })

    it('rejects an unknown id', () => {
      expect(() => tool('update_todo')({ id: 999 })).toThrow(/No todo with id 999/)
    })
  })

  describe('complete_todo', () => {
    it('completes and uncompletes a todo', () => {
      const todo = tool('add_todo')({ title: 'Toggle me' })
      expect(tool('complete_todo')({ id: todo.id }).completed).toBe(true)
      expect(tool('complete_todo')({ id: todo.id, completed: false }).completed).toBe(false)
    })

    it('moves the todo into the Done column and back out', () => {
      const todo = tool('add_todo')({ title: 'Column' })
      expect(tool('complete_todo')({ id: todo.id }).status).toBe('Done')
      expect(tool('complete_todo')({ id: todo.id, completed: false }).status).toBeNull()
    })

    it('creates the next occurrence of a recurring todo', () => {
      const todo = tool('add_todo')({ title: 'Weekly', end_date: '2026-03-25' })
      db.updateTodo({ ...db.getTodo(todo.id), recurrence_type: 'weekly', recurrence_interval: 1 })

      tool('complete_todo')({ id: todo.id })

      const open = db.getAllTodos().filter((t) => t.title === 'Weekly' && !t.completed)
      expect(open).toHaveLength(1)
      expect(open[0].end_date).toBe('2026-04-01')
    })
  })

  describe('search_todos', () => {
    it('finds todos by title', () => {
      tool('add_todo')({ title: 'Validation conversations' })
      const results = tool('search_todos')({ query: 'Validation' })
      expect(results.todos).toHaveLength(1)
    })

    it('rejects an empty query', () => {
      expect(() => tool('search_todos')({ query: '  ' })).toThrow(/query is required/)
    })
  })
})
