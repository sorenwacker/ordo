// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  findDoneStatus,
  statusForCompletion,
  completionForStatus
} from '../src/shared/doneStatus.js'
import { useTodos } from '../src/renderer/composables/useTodos.js'

const WITH_DONE = [
  { id: 10, name: 'Todo' },
  { id: 20, name: 'In Progress' },
  { id: 30, name: ' done ' }
]

const WITHOUT_DONE = [
  { id: 10, name: 'Todo' },
  { id: 20, name: 'In Progress' }
]

describe('findDoneStatus', () => {
  it('matches the status named Done regardless of case and padding', () => {
    expect(findDoneStatus(WITH_DONE)).toMatchObject({ id: 30 })
  })

  it('returns null when no status is named Done', () => {
    expect(findDoneStatus(WITHOUT_DONE)).toBeNull()
    expect(findDoneStatus([])).toBeNull()
    expect(findDoneStatus(undefined)).toBeNull()
  })

  it('does not match names that merely contain done', () => {
    expect(findDoneStatus([{ id: 1, name: 'Almost done' }])).toBeNull()
  })
})

describe('statusForCompletion', () => {
  it('moves a completed todo into the Done column', () => {
    expect(statusForCompletion(10, true, WITH_DONE)).toBe(30)
    expect(statusForCompletion(null, true, WITH_DONE)).toBe(30)
  })

  it('moves an un-completed todo out of the Done column', () => {
    expect(statusForCompletion(30, false, WITH_DONE)).toBeNull()
  })

  it('leaves the column alone when un-completing outside the Done column', () => {
    expect(statusForCompletion(20, false, WITH_DONE)).toBe(20)
  })

  it('leaves the column alone when there is no Done column', () => {
    expect(statusForCompletion(10, true, WITHOUT_DONE)).toBe(10)
    expect(statusForCompletion(10, false, WITHOUT_DONE)).toBe(10)
  })
})

describe('completionForStatus', () => {
  it('completes a todo dropped into the Done column', () => {
    expect(completionForStatus(10, 30, false, WITH_DONE)).toBe(true)
  })

  it('un-completes a todo dragged out of the Done column', () => {
    expect(completionForStatus(30, 10, true, WITH_DONE)).toBe(false)
    expect(completionForStatus(30, null, true, WITH_DONE)).toBe(false)
  })

  it('leaves completion alone between two other columns', () => {
    expect(completionForStatus(10, 20, true, WITH_DONE)).toBe(true)
    expect(completionForStatus(10, 20, false, WITH_DONE)).toBe(false)
  })

  it('leaves completion alone when there is no Done column', () => {
    expect(completionForStatus(10, 20, false, WITHOUT_DONE)).toBe(false)
  })
})

describe('useTodos completion and moves', () => {
  let api
  let todos

  function makeTodo(overrides = {}) {
    return { id: 1, title: 'Card', completed: false, status_id: 10, end_date: null, ...overrides }
  }

  beforeEach(() => {
    api = {
      setTodoCompleted: vi.fn().mockResolvedValue(undefined),
      moveTodo: vi.fn().mockResolvedValue(undefined),
      getTodos: vi.fn().mockResolvedValue([])
    }
    window.api = api
    todos = useTodos()
  })

  // The transition itself (due date, Done column, next occurrence) is the
  // database's, in one transaction (tests/completion.test.js); the composable
  // only says which todo and which state.
  it('asks the database to complete an open card and to reopen a done one', async () => {
    await todos.toggleComplete(makeTodo())
    expect(api.setTodoCompleted).toHaveBeenCalledWith(1, true)

    await todos.toggleComplete(makeTodo({ completed: true }))
    expect(api.setTodoCompleted).toHaveBeenCalledWith(1, false)
  })

  it('asks the database to move a card to a column', async () => {
    await todos.moveTodoTo(makeTodo(), { statusId: 30 })
    expect(api.moveTodo).toHaveBeenCalledWith(1, { statusId: 30, projectId: undefined })
  })

  it('passes the project along when the move crosses project sections', async () => {
    await todos.moveTodoTo(makeTodo({ project_id: 5 }), { statusId: 20, projectId: 7 })
    expect(api.moveTodo).toHaveBeenCalledWith(1, { statusId: 20, projectId: 7 })
  })
})
