import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { unlinkSync, existsSync } from 'fs'
import { Database } from '../src/main/database.js'
import { ActionHistory } from '../src/main/history.js'
import { completionAction } from '../src/main/completionHistory.js'

/**
 * Completing a todo is one transition owned by the database
 * (docs/kanban.md, "The Done column"): the flag, the due date a completion
 * sets, the Done column and the next occurrence of a recurring todo, in one
 * transaction. Three copies of this logic used to live in the checkbox, the
 * board and the MCP server, and the app wrote it in two calls, so a failure
 * between them could complete a recurring todo without its next occurrence.
 */

const today = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

describe('the completion transition', () => {
  let db
  let dbPath
  let done
  let inProgress

  beforeEach(() => {
    dbPath = join(
      tmpdir(),
      `test-completion-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    )
    db = new Database(dbPath)
    done = db.getAllStatuses().find((s) => s.name === 'Done')
    inProgress = db.getAllStatuses().find((s) => s.name !== 'Done')
  })

  afterEach(() => {
    db.close()
    for (const suffix of ['', '-wal', '-shm']) {
      if (existsSync(dbPath + suffix)) unlinkSync(dbPath + suffix)
    }
  })

  describe('setCompleted', () => {
    it('completes a todo, dates it today and moves it into the Done column', () => {
      const todo = db.createTodo('Write report')
      db.updateTodo({ ...todo, status_id: inProgress.id })

      const { todo: written, next } = db.setCompleted(todo.id, true)

      expect(written).toMatchObject({ completed: 1, end_date: today(), status_id: done.id })
      expect(written.completed_at).toBeTruthy()
      expect(next).toBeNull()
    })

    it('keeps a due date that was already set', () => {
      const todo = db.createTodo('Dated')
      db.updateTodo({ ...todo, end_date: '2026-03-01' })

      expect(db.setCompleted(todo.id, true).todo.end_date).toBe('2026-03-01')
    })

    it('reopens a todo in the Done column into No Status, keeping its due date', () => {
      const todo = db.createTodo('Reopen me')
      db.setCompleted(todo.id, true)

      const { todo: written } = db.setCompleted(todo.id, false)

      expect(written).toMatchObject({ completed: 0, status_id: null, end_date: today() })
      expect(written.completed_at).toBeNull()
    })

    it('reopens a todo in another column without moving it', () => {
      const todo = db.createTodo('Elsewhere')
      db.setCompleted(todo.id, true)
      db.updateTodo({ ...db.getTodo(todo.id), status_id: inProgress.id })

      expect(db.setCompleted(todo.id, false).todo.status_id).toBe(inProgress.id)
    })

    it('leaves the column alone when no status is named Done', () => {
      db.deleteStatus(done.id)
      const todo = db.createTodo('No done column')
      db.updateTodo({ ...todo, status_id: inProgress.id })

      expect(db.setCompleted(todo.id, true).todo).toMatchObject({
        completed: 1,
        status_id: inProgress.id
      })
    })

    it('creates the next occurrence of a recurring todo, once', () => {
      const todo = db.createTodo('Water plants')
      db.updateTodo({ ...todo, end_date: '2026-05-04', recurrence_type: 'weekly' })

      const { next } = db.setCompleted(todo.id, true)
      expect(next).toMatchObject({ title: 'Water plants', end_date: '2026-05-11', completed: 0 })

      // Completing an already completed todo, or reopening it, creates nothing
      expect(db.setCompleted(todo.id, true).next).toBeNull()
      expect(db.setCompleted(todo.id, false).next).toBeNull()
      expect(db.getAllTodos()).toHaveLength(2)
    })

    it('starts the next occurrence open, in the column the todo was in', () => {
      // The next occurrence used to be copied from the todo after it had moved
      // to Done, so every recurring task's next instance was born in the Done
      // column, unticked and hidden with the done items.
      const todo = db.createTodo('Standup')
      db.updateTodo({ ...todo, status_id: inProgress.id, recurrence_type: 'daily' })

      const { next } = db.setCompleted(todo.id, true)

      expect(next).toMatchObject({ completed: 0, status_id: inProgress.id })
      expect(db.moveTodo(next.id, { statusId: done.id }).next).toMatchObject({
        completed: 0,
        status_id: inProgress.id
      })
    })

    it('writes nothing when creating the next occurrence fails', () => {
      const todo = db.createTodo('Fragile')
      db.updateTodo({ ...todo, recurrence_type: 'daily' })
      db._nextRecurrenceFrom = () => {
        throw new Error('disk full')
      }

      expect(() => db.setCompleted(todo.id, true)).toThrow('disk full')

      expect(db.getTodo(todo.id)).toMatchObject({ completed: 0, end_date: null, status_id: null })
      expect(db.getAllTodos()).toHaveLength(1)
    })

    it('answers an unknown id with no todo', () => {
      expect(db.setCompleted(999, true)).toEqual({ todo: null, next: null })
    })
  })

  describe('moveTodo', () => {
    it('completes a todo dropped into the Done column, with the same transition', () => {
      const todo = db.createTodo('Drop me')
      db.updateTodo({ ...todo, recurrence_type: 'daily', end_date: '2026-05-04' })

      const { todo: written, next } = db.moveTodo(todo.id, { statusId: done.id })

      expect(written).toMatchObject({ completed: 1, status_id: done.id, end_date: '2026-05-04' })
      expect(next).toMatchObject({ end_date: '2026-05-05' })
    })

    it('dates an undated todo when a drop into Done completes it', () => {
      const todo = db.createTodo('Undated')

      expect(db.moveTodo(todo.id, { statusId: done.id }).todo.end_date).toBe(today())
    })

    it('reopens a todo dragged out of the Done column, keeping its due date', () => {
      const todo = db.createTodo('Drag out')
      db.setCompleted(todo.id, true)

      const { todo: written } = db.moveTodo(todo.id, { statusId: inProgress.id })

      expect(written).toMatchObject({ completed: 0, status_id: inProgress.id, end_date: today() })
    })

    it('reopens a todo dragged from Done to No Status', () => {
      const todo = db.createTodo('To no status')
      db.setCompleted(todo.id, true)

      expect(db.moveTodo(todo.id, { statusId: null }).todo).toMatchObject({
        completed: 0,
        status_id: null
      })
    })

    it('leaves completion alone between two other columns', () => {
      const todo = db.createTodo('Sideways')
      db.updateTodo({ ...todo, recurrence_type: 'daily' })

      const { todo: written, next } = db.moveTodo(todo.id, { statusId: inProgress.id })

      expect(written).toMatchObject({ completed: 0, status_id: inProgress.id })
      expect(next).toBeNull()
    })

    it('moves the project along when the drop crosses project sections', () => {
      const project = db.createProject('Garden')
      const todo = db.createTodo('Cross over')

      const { todo: written } = db.moveTodo(todo.id, {
        statusId: inProgress.id,
        projectId: project.id
      })
      expect(written).toMatchObject({ project_id: project.id, status_id: inProgress.id })

      // A move without a project leaves it where it is
      expect(db.moveTodo(todo.id, { statusId: null }).todo.project_id).toBe(project.id)
    })
  })

  describe('undo and redo of a completion', () => {
    it('removes the occurrence a completion created, and recreates it on redo', async () => {
      const history = new ActionHistory()
      const todo = db.createTodo('Recurring')
      db.updateTodo({ ...todo, recurrence_type: 'daily', end_date: '2026-05-04' })
      const oldTodo = db.getTodo(todo.id)

      const result = db.setCompleted(todo.id, true)
      history.push(
        completionAction(db, oldTodo, result, () => db.setCompleted(todo.id, true), 'Complete')
      )
      expect(db.getAllTodos()).toHaveLength(2)

      await history.undo()
      expect(db.getTodo(todo.id)).toMatchObject({ completed: 0, status_id: null })
      expect(db.getAllTodos()).toHaveLength(1)

      await history.redo()
      expect(db.getTodo(todo.id).completed).toBe(1)
      expect(db.getAllTodos()).toHaveLength(2)

      // The redo created a new row; undoing again removes that one, not a stale id
      await history.undo()
      expect(db.getAllTodos()).toHaveLength(1)
    })

    it('records nothing when the transition changed nothing', () => {
      const todo = db.createTodo('Already done')
      db.setCompleted(todo.id, true)
      const oldTodo = db.getTodo(todo.id)

      const result = db.setCompleted(todo.id, true)

      expect(completionAction(db, oldTodo, result, () => result, 'Complete')).toBeNull()
    })
  })
})
