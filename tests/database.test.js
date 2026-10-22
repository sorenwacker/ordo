import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { unlinkSync, existsSync } from 'fs'
import { Database } from '../src/main/database.js'

// Exercises the real production Database class (src/main/database.js).
// Passing a db path keeps electron's `app` import out of the code path,
// so it runs under vitest/node.

describe('Database', () => {
  let db
  let testDbPath

  beforeEach(() => {
    testDbPath = join(tmpdir(), `test-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
    db = new Database(testDbPath)
  })

  afterEach(() => {
    db.close()
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath)
    }
  })

  describe('Concurrency setup', () => {
    it('runs in WAL journal mode with a busy timeout', () => {
      expect(db.db.pragma('journal_mode', { simple: true })).toBe('wal')
      expect(db.db.pragma('busy_timeout', { simple: true })).toBe(5000)
    })

    it('exposes a data version that changes only on commits from other connections', () => {
      const before = db.getDataVersion()
      db.createProject('Own write', '#0f9d58')
      expect(db.getDataVersion()).toBe(before)

      const other = new Database(testDbPath)
      other.createProject('Other connection', '#0f9d58')
      other.close()
      expect(db.getDataVersion()).not.toBe(before)
    })
  })

  describe('Projects', () => {
    it('should create a project', () => {
      const project = db.createProject('Work', '#e74c3c')

      expect(project.id).toBeDefined()
      expect(project.name).toBe('Work')
      expect(project.color).toBe('#e74c3c')
    })

    it('should use the default color when none is given', () => {
      const project = db.createProject('Work')
      expect(project.color).toBe('#0f4c75')
    })

    it('should list all (non-deleted) projects', () => {
      db.createProject('Work')
      db.createProject('Personal')

      const projects = db.getAllProjects()
      expect(projects).toHaveLength(2)
    })

    it('should get a project by id', () => {
      const project = db.createProject('Work')
      expect(db.getProject(project.id).name).toBe('Work')
    })

    it('should update a project', () => {
      const project = db.createProject('Work')
      const updated = db.updateProject({ ...project, name: 'Office', color: '#2ecc71' })

      expect(updated.name).toBe('Office')
      expect(updated.color).toBe('#2ecc71')
    })

    it('should default new projects to empty notes', () => {
      const project = db.createProject('Work')
      expect(project.notes).toBe('')
    })

    it('should persist project notes', () => {
      const project = db.createProject('Work')
      const updated = db.updateProjectNotes(project.id, '# Plan\n- ship it')

      expect(updated.notes).toBe('# Plan\n- ship it')
      expect(db.getProject(project.id).notes).toBe('# Plan\n- ship it')
    })

    it('should not change name or color when updating notes', () => {
      const project = db.createProject('Work', '#e74c3c')
      const updated = db.updateProjectNotes(project.id, 'note')

      expect(updated.name).toBe('Work')
      expect(updated.color).toBe('#e74c3c')
    })

    it('should soft delete a project (row remains, excluded from list)', () => {
      const project = db.createProject('Work')
      db.deleteProject(project.id)

      // Soft delete: getProject still returns the row with deleted_at set,
      // but getAllProjects excludes it.
      const row = db.getProject(project.id)
      expect(row).toBeDefined()
      expect(row.deleted_at).not.toBeNull()
      expect(db.getAllProjects()).toHaveLength(0)
    })

    it("should move a deleted project's todos to inbox", () => {
      const project = db.createProject('Work')
      const todo = db.createTodo('Task', project.id)

      db.deleteProject(project.id)

      const reloaded = db.getTodo(todo.id)
      expect(reloaded.project_id).toBeNull()
      expect(db.getAllTodos('inbox')).toHaveLength(1)
    })

    it('should list deleted projects', () => {
      const project = db.createProject('Work')
      db.deleteProject(project.id)

      const deleted = db.getDeletedProjects()
      expect(deleted).toHaveLength(1)
      expect(deleted[0].id).toBe(project.id)
    })

    it('should restore a soft-deleted project', () => {
      const project = db.createProject('Work')
      db.deleteProject(project.id)
      db.restoreProject(project.id)

      expect(db.getAllProjects()).toHaveLength(1)
      expect(db.getDeletedProjects()).toHaveLength(0)
    })

    it('should permanently delete a project', () => {
      const project = db.createProject('Work')
      db.permanentlyDeleteProject(project.id)

      expect(db.getProject(project.id)).toBeUndefined()
    })
  })

  describe('Statuses', () => {
    it('should seed default statuses on init', () => {
      const statuses = db.getAllStatuses()
      expect(statuses.length).toBeGreaterThanOrEqual(4)
      expect(statuses.map((s) => s.name)).toContain('Todo')
      expect(statuses.map((s) => s.name)).toContain('Done')
    })

    it('should create a status', () => {
      const status = db.createStatus('Review', '#abcdef')
      expect(status.id).toBeDefined()
      expect(status.name).toBe('Review')
      expect(status.color).toBe('#abcdef')
    })

    it('should get a status by id', () => {
      const status = db.createStatus('Review')
      expect(db.getStatus(status.id).name).toBe('Review')
    })

    it('should update a status', () => {
      const status = db.createStatus('Review')
      const updated = db.updateStatus({ ...status, name: 'Reviewed', color: '#000000' })
      expect(updated.name).toBe('Reviewed')
      expect(updated.color).toBe('#000000')
    })

    it('should delete a status', () => {
      const status = db.createStatus('Review')
      db.deleteStatus(status.id)
      expect(db.getStatus(status.id)).toBeUndefined()
    })
  })

  describe('Todos with Projects', () => {
    it('should create a todo with a project', () => {
      const project = db.createProject('Work')
      const todo = db.createTodo('Task 1', project.id)

      expect(todo.project_id).toBe(project.id)
      expect(todo.project_name).toBe('Work')
    })

    it('should create a todo without a project (inbox)', () => {
      const todo = db.createTodo('Inbox task')

      expect(todo.project_id).toBeNull()
      expect(todo.project_name).toBeNull()
    })

    it('should filter todos by project, inbox and all', () => {
      const project = db.createProject('Work')
      db.createTodo('Work task', project.id)
      db.createTodo('Inbox task')

      expect(db.getAllTodos(project.id)).toHaveLength(1)
      expect(db.getAllTodos('inbox')).toHaveLength(1)
      expect(db.getAllTodos(null)).toHaveLength(2)
    })

    it('should move a todo to a different project', () => {
      const project1 = db.createProject('Work')
      const project2 = db.createProject('Personal')
      const todo = db.createTodo('Task', project1.id)

      const updated = db.updateTodo({ ...todo, project_id: project2.id })

      expect(updated.project_id).toBe(project2.id)
      expect(updated.project_name).toBe('Personal')
    })
  })

  describe('Basic Todo Operations', () => {
    it('should create a todo', () => {
      const todo = db.createTodo('Test todo')

      expect(todo.id).toBeDefined()
      expect(todo.title).toBe('Test todo')
      expect(todo.completed).toBe(0)
    })

    it('should create a todo with the default type', () => {
      const todo = db.createTodo('Task')
      expect(todo.type).toBe('todo')
    })

    it('should create a todo with an explicit type', () => {
      const note = db.createTodo('Note title', null, 'note')
      expect(note.type).toBe('note')
    })

    it('should update todo notes', () => {
      const todo = db.createTodo('Test')
      const updated = db.updateTodo({ ...todo, notes: '# Notes\nSome content' })

      expect(updated.notes).toBe('# Notes\nSome content')
    })

    it('should update the todo end_date', () => {
      const todo = db.createTodo('Test')
      const updated = db.updateTodo({ ...todo, end_date: '2024-12-31' })

      expect(updated.end_date).toBe('2024-12-31')
    })

    it('should clear end_date when an empty string is given', () => {
      const todo = db.createTodo('Test')
      const withDate = db.updateTodo({ ...todo, end_date: '2024-12-31' })
      const cleared = db.updateTodo({ ...withDate, end_date: '' })

      expect(cleared.end_date).toBeNull()
    })

    it('should preserve recurrence_end_date when a generic update omits it', () => {
      const todo = db.createTodo('Test')
      const recurring = db.updateTodo({
        ...todo,
        recurrence_type: 'weekly',
        recurrence_interval: 1,
        recurrence_end_date: '2026-12-31'
      })
      expect(recurring.recurrence_end_date).toBe('2026-12-31')

      // A generic edit (e.g. rename) that does not carry the field must not
      // wipe it, or an imported recurring todo would recur forever.
      const renamed = { ...recurring, title: 'Renamed' }
      delete renamed.recurrence_end_date
      const updated = db.updateTodo(renamed)

      expect(updated.recurrence_end_date).toBe('2026-12-31')
    })

    it('should clear recurrence_end_date when an empty string is given', () => {
      const todo = db.createTodo('Test')
      const recurring = db.updateTodo({ ...todo, recurrence_end_date: '2026-12-31' })
      const cleared = db.updateTodo({ ...recurring, recurrence_end_date: '' })

      expect(cleared.recurrence_end_date).toBeNull()
    })

    it('should set completed_at when a todo is completed', () => {
      const todo = db.createTodo('Test')
      const completed = db.updateTodo({ ...todo, completed: true })

      expect(completed.completed).toBe(1)
      expect(completed.completed_at).not.toBeNull()
    })

    it('should clear completed_at when a todo is uncompleted', () => {
      const todo = db.createTodo('Test')
      const completed = db.updateTodo({ ...todo, completed: true })
      const reopened = db.updateTodo({ ...completed, completed: false })

      expect(reopened.completed).toBe(0)
      expect(reopened.completed_at).toBeNull()
    })

    it('should soft delete a todo (excluded from list, still gettable)', () => {
      const todo = db.createTodo('Test')
      db.deleteTodo(todo.id)

      // getAllTodos excludes the soft-deleted row.
      expect(db.getAllTodos()).toHaveLength(0)

      // getTodo still returns it with deleted_at set.
      const row = db.getTodo(todo.id)
      expect(row).toBeDefined()
      expect(row.deleted_at).not.toBeNull()
    })

    it('should restore a soft-deleted todo', () => {
      const todo = db.createTodo('Test')
      db.deleteTodo(todo.id)
      db.restoreTodo(todo.id)

      expect(db.getAllTodos()).toHaveLength(1)
      expect(db.getTodo(todo.id).deleted_at).toBeNull()
    })

    it('should reorder todos', () => {
      const todo1 = db.createTodo('First')
      const todo2 = db.createTodo('Second')
      const todo3 = db.createTodo('Third')

      db.reorderTodos([todo3.id, todo1.id, todo2.id])

      const todos = db.getAllTodos()
      expect(todos.map((t) => t.id)).toEqual([todo3.id, todo1.id, todo2.id])
    })
  })

  describe('Trash and Archive', () => {
    it('should report the trash count', () => {
      const todo = db.createTodo('Test')
      expect(db.getTrashCount()).toBe(0)
      db.deleteTodo(todo.id)
      expect(db.getTrashCount()).toBe(1)
    })

    it('should permanently delete a todo', () => {
      const todo = db.createTodo('Test')
      db.deleteTodo(todo.id)
      db.permanentlyDeleteTodo(todo.id)

      expect(db.getTodo(todo.id)).toBeUndefined()
      expect(db.getTrashCount()).toBe(0)
    })

    it('should empty the trash', () => {
      const a = db.createTodo('A')
      const b = db.createTodo('B')
      db.deleteTodo(a.id)
      db.deleteTodo(b.id)

      db.emptyTrash()

      expect(db.getTrashCount()).toBe(0)
      expect(db.getTodo(a.id)).toBeUndefined()
      expect(db.getTodo(b.id)).toBeUndefined()
    })

    it('should archive a todo (excluded from list, counted)', () => {
      const todo = db.createTodo('Test')
      db.archiveTodo(todo.id)

      expect(db.getAllTodos()).toHaveLength(0)
      expect(db.getArchiveCount()).toBe(1)

      const archived = db.getArchivedTodos()
      expect(archived).toHaveLength(1)
      expect(archived[0].id).toBe(todo.id)
    })

    it('should unarchive a todo', () => {
      const todo = db.createTodo('Test')
      db.archiveTodo(todo.id)
      db.unarchiveTodo(todo.id)

      expect(db.getAllTodos()).toHaveLength(1)
      expect(db.getArchiveCount()).toBe(0)
    })
  })

  describe('Todo Links', () => {
    it('should link two todos', () => {
      const todo1 = db.createTodo('Task 1')
      const todo2 = db.createTodo('Task 2')

      db.linkTodos(todo1.id, todo2.id)

      const linked = db.getLinkedTodos(todo1.id)
      expect(linked).toHaveLength(1)
      expect(linked[0].id).toBe(todo2.id)
    })

    it('should get linked todos from either direction', () => {
      const todo1 = db.createTodo('Task 1')
      const todo2 = db.createTodo('Task 2')

      db.linkTodos(todo1.id, todo2.id)

      expect(db.getLinkedTodos(todo1.id)).toHaveLength(1)
      expect(db.getLinkedTodos(todo2.id)).toHaveLength(1)
    })

    it('should not create duplicate links', () => {
      const todo1 = db.createTodo('Task 1')
      const todo2 = db.createTodo('Task 2')

      db.linkTodos(todo1.id, todo2.id)
      db.linkTodos(todo2.id, todo1.id)

      expect(db.getLinkedTodos(todo1.id)).toHaveLength(1)
    })

    it('should not link a todo to itself', () => {
      const todo = db.createTodo('Task')

      expect(db.linkTodos(todo.id, todo.id)).toBe(false)
      expect(db.getLinkedTodos(todo.id)).toHaveLength(0)
    })

    it('should unlink todos', () => {
      const todo1 = db.createTodo('Task 1')
      const todo2 = db.createTodo('Task 2')

      db.linkTodos(todo1.id, todo2.id)
      db.unlinkTodos(todo1.id, todo2.id)

      expect(db.getLinkedTodos(todo1.id)).toHaveLength(0)
    })
  })

  describe('Search', () => {
    it('should search todos by title', () => {
      db.createTodo('Buy groceries')
      db.createTodo('Buy presents')
      db.createTodo('Clean house')

      expect(db.searchTodos('Buy')).toHaveLength(2)
    })

    it('should exclude a specified todo from search', () => {
      const todo1 = db.createTodo('Buy groceries')
      db.createTodo('Buy presents')

      const results = db.searchTodos('Buy', todo1.id)

      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Buy presents')
    })

    it('should not return soft-deleted todos from search', () => {
      const todo1 = db.createTodo('Buy groceries')
      db.createTodo('Buy presents')
      db.deleteTodo(todo1.id)

      expect(db.searchTodos('Buy')).toHaveLength(1)
    })
  })

  describe('Settings', () => {
    it('should return null for a non-existent setting', () => {
      expect(db.getSetting('non_existent_key')).toBeNull()
    })

    it('should set and retrieve a string setting', () => {
      db.setSetting('theme', 'dark')
      expect(db.getSetting('theme')).toBe('dark')
    })

    it('should set and retrieve a boolean setting', () => {
      db.setSetting('hide_completed', true)
      expect(db.getSetting('hide_completed')).toBe(true)
    })

    it('should set and retrieve a number setting', () => {
      db.setSetting('card_size', 280)
      expect(db.getSetting('card_size')).toBe(280)
    })

    it('should update an existing setting', () => {
      db.setSetting('theme', 'light')
      db.setSetting('theme', 'dark')
      expect(db.getSetting('theme')).toBe('dark')
    })

    it('should get all settings as an object', () => {
      db.setSetting('theme', 'dark')
      db.setSetting('card_size', 300)
      db.setSetting('hide_completed', false)

      const settings = db.getAllSettings()

      expect(settings.theme).toBe('dark')
      expect(settings.card_size).toBe(300)
      expect(settings.hide_completed).toBe(false)
    })
  })

  describe('Tags', () => {
    it('should add a tag to a todo and read it back', () => {
      const todo = db.createTodo('Task')
      db.addTodoTag(todo.id, 'urgent')

      const tags = db.getTodoTags(todo.id)
      expect(tags).toHaveLength(1)
      expect(tags[0].name).toBe('urgent')
    })

    it('should list all tags', () => {
      const todo = db.createTodo('Task')
      db.addTodoTag(todo.id, 'urgent')
      db.addTodoTag(todo.id, 'home')

      const all = db.getAllTags()
      expect(all.map((t) => t.name).sort()).toEqual(['home', 'urgent'])
    })

    it('should reuse an existing tag rather than duplicating it', () => {
      const todo1 = db.createTodo('Task 1')
      const todo2 = db.createTodo('Task 2')
      db.addTodoTag(todo1.id, 'shared')
      db.addTodoTag(todo2.id, 'shared')

      expect(db.getAllTags().filter((t) => t.name === 'shared')).toHaveLength(1)
    })

    it('should remove a tag from a todo and clean up the orphan', () => {
      const todo = db.createTodo('Task')
      const tag = db.addTodoTag(todo.id, 'urgent')

      db.removeTodoTag(todo.id, tag.id)

      expect(db.getTodoTags(todo.id)).toHaveLength(0)
      // Tag was orphaned, so it is removed entirely.
      expect(db.getAllTags()).toHaveLength(0)
    })

    it('should add and remove a project tag', () => {
      const project = db.createProject('Work')
      const tag = db.addProjectTag(project.id, 'priority')

      expect(db.getProjectTags(project.id)).toHaveLength(1)

      db.removeProjectTag(project.id, tag.id)
      expect(db.getProjectTags(project.id)).toHaveLength(0)
    })
  })

  describe('Global Search', () => {
    beforeEach(() => {
      db.createProject('Work Project', '#e74c3c')
      db.createProject('Personal Project', '#3498db')
      db.createTodo('Buy groceries')
      db.createTodo('Review code changes')
      const todoWithNotes = db.createTodo('Meeting prep')
      db.updateTodo({ ...todoWithNotes, notes: 'Discuss quarterly review' })
    })

    it('should search todos by title', () => {
      const results = db.globalSearch('Buy')
      expect(results.todos).toHaveLength(1)
      expect(results.todos[0].title).toBe('Buy groceries')
    })

    it('should search todos by notes content', () => {
      const results = db.globalSearch('quarterly')
      expect(results.todos).toHaveLength(1)
      expect(results.todos[0].title).toBe('Meeting prep')
    })

    it('should search projects by name', () => {
      const results = db.globalSearch('Work')
      expect(results.projects).toHaveLength(1)
      expect(results.projects[0].name).toBe('Work Project')
    })

    it('should find tags via global search', () => {
      const todo = db.createTodo('Tagged task')
      db.addTodoTag(todo.id, 'globaltag')

      const results = db.globalSearch('globaltag')
      expect(results.tags.map((t) => t.name)).toContain('globaltag')
      // The tagged todo is also matched via its tag.
      expect(results.todos.map((t) => t.id)).toContain(todo.id)
    })

    it('should return the { todos, projects, tags } shape', () => {
      const results = db.globalSearch('code')

      expect(results).toHaveProperty('todos')
      expect(results).toHaveProperty('projects')
      expect(results).toHaveProperty('tags')
      expect(Array.isArray(results.todos)).toBe(true)
      expect(Array.isArray(results.projects)).toBe(true)
      expect(Array.isArray(results.tags)).toBe(true)
    })

    it('should return empty results for no matches', () => {
      const results = db.globalSearch('xyz123nonexistent')
      expect(results.todos).toHaveLength(0)
      expect(results.projects).toHaveLength(0)
      expect(results.tags).toHaveLength(0)
    })

    it('should not return soft-deleted todos in global search', () => {
      const todo = db.createTodo('SearchMeUnique')
      expect(db.globalSearch('SearchMeUnique').todos).toHaveLength(1)
      db.deleteTodo(todo.id)
      expect(db.globalSearch('SearchMeUnique').todos).toHaveLength(0)
    })

    it('should respect the limit parameter', () => {
      for (let i = 0; i < 25; i++) {
        db.createTodo(`Test item ${i}`)
      }

      const results = db.globalSearch('Test', 5)
      expect(results.todos.length).toBeLessThanOrEqual(5)
    })
  })

  describe('Reset', () => {
    let backupPath

    afterEach(() => {
      if (backupPath && existsSync(backupPath)) {
        unlinkSync(backupPath)
      }
      backupPath = null
    })

    it('should empty the database and reseed default statuses', () => {
      db.createProject('Work')
      db.createTodo('Task')
      backupPath = db.reset()

      expect(db.getAllProjects()).toHaveLength(0)
      expect(db.getAllTodos()).toHaveLength(0)
      expect(db.getAllStatuses().map((s) => s.name)).toEqual([
        'Todo',
        'In Progress',
        'Done',
        'Backlog'
      ])
    })

    it('should keep the previous data in a backup file next to the original', () => {
      db.createTodo('Preserved task')
      backupPath = db.reset()

      expect(backupPath).toMatch(/-backup-\d{6}-\d{6}\.db$/)
      expect(dirname(backupPath)).toBe(dirname(testDbPath))
      expect(existsSync(backupPath)).toBe(true)

      const backup = new Database(backupPath)
      const todos = backup.getAllTodos()
      backup.close()
      expect(todos).toHaveLength(1)
      expect(todos[0].title).toBe('Preserved task')
    })

    it('should keep the database usable at the original path after reset', () => {
      backupPath = db.reset()

      const todo = db.createTodo('After reset')
      expect(existsSync(testDbPath)).toBe(true)
      expect(db.getTodo(todo.id).title).toBe('After reset')
    })
  })
})
