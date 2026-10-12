// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import KanbanView from '../src/renderer/components/KanbanView.vue'
import todoActionsMixin from '../src/renderer/mixins/todoActionsMixin.js'
import { useTodos } from '../src/renderer/composables/useTodos.js'

const STATUSES = [
  { id: 10, name: 'Todo', color: '#aaa' },
  { id: 20, name: 'Doing', color: '#bbb' }
]

const STATUSES_WITH_DONE = [...STATUSES, { id: 30, name: 'Done', color: '#ccc' }]

function makeTodo(overrides = {}) {
  return {
    id: 1,
    title: 'Test todo',
    project_id: 5,
    status_id: 10,
    deleted: 0,
    ...overrides
  }
}

// A stand-in for the SortableJS `end` event. `to` is the destination list, and
// `item` carries the vuedraggable context vuedraggable attaches to the element.
function endEvent(todo, toDataset) {
  const to = document.createElement('div')
  Object.assign(to.dataset, toDataset)
  const item = document.createElement('div')
  item.__draggable_context = { element: todo }
  return { item, to }
}

// The mixin only needs these members from its host component. The drop
// handlers delegate the write to the todos composable, so the real one stands
// in and the assertions read the `window.api` calls it makes.
function makeHost(allTodos, statuses = STATUSES) {
  return {
    ...todoActionsMixin.methods,
    allTodos,
    statuses,
    todosComposable: useTodos(),
    toPlainTodo: (t) => ({ ...t }),
    loadAllTodos: vi.fn(),
    loadTodos: vi.fn()
  }
}

describe('KanbanView drop zones', () => {
  it('labels each grouped-board list with its project and status', () => {
    const wrapper = mount(KanbanView, {
      props: {
        groupByProject: true,
        isProjectSelected: false,
        statuses: STATUSES,
        groupedTodos: [
          { id: 'inbox', name: 'Inbox', color: '#666', todos: [] },
          { id: 5, name: 'Work', color: '#f00', todos: [] }
        ],
        allTodos: []
      },
      // The stub keeps the fallthrough attrs under test; the lists are empty,
      // so the item slot is never needed.
      global: { stubs: { draggable: { template: '<div />' } } }
    })

    const zones = wrapper.findAll('.kanban-cards').map((el) => ({
      project: el.attributes('data-project-id'),
      status: el.attributes('data-status-id')
    }))

    expect(zones).toEqual([
      { project: '', status: '' },
      { project: '', status: '10' },
      { project: '', status: '20' },
      { project: '5', status: '' },
      { project: '5', status: '10' },
      { project: '5', status: '20' }
    ])
  })
})

describe('onStackedKanbanDrop', () => {
  let updateTodo

  beforeEach(() => {
    updateTodo = vi.fn().mockResolvedValue(undefined)
    window.api = {
      updateTodo,
      getTodos: vi.fn().mockResolvedValue([]),
      createNextRecurrence: vi.fn().mockResolvedValue(undefined)
    }
  })

  it('moves the card to the status of the column it was dropped into', async () => {
    const todo = makeTodo({ project_id: 5, status_id: 10 })
    const host = makeHost([todo])

    await host.onStackedKanbanDrop(endEvent(todo, { projectId: '5', statusId: '20' }))

    expect(updateTodo).toHaveBeenCalledWith(expect.objectContaining({ id: 1, status_id: 20 }))
  })

  it('clears the status when dropped into the No Status column', async () => {
    const todo = makeTodo({ project_id: 5, status_id: 10 })
    const host = makeHost([todo])

    await host.onStackedKanbanDrop(endEvent(todo, { projectId: '5', statusId: '' }))

    expect(updateTodo).toHaveBeenCalledWith(expect.objectContaining({ id: 1, status_id: null }))
  })

  it('moves the card to the project section it was dropped into', async () => {
    const todo = makeTodo({ project_id: 5, status_id: 10 })
    const host = makeHost([todo])

    await host.onStackedKanbanDrop(endEvent(todo, { projectId: '7', statusId: '20' }))

    expect(updateTodo).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, project_id: 7, status_id: 20 })
    )
  })

  it('clears the project when dropped into the Inbox section', async () => {
    const todo = makeTodo({ project_id: 5, status_id: 10 })
    const host = makeHost([todo])

    await host.onStackedKanbanDrop(endEvent(todo, { projectId: '', statusId: '10' }))

    expect(updateTodo).toHaveBeenCalledWith(expect.objectContaining({ id: 1, project_id: null }))
  })

  it('ignores an event with no draggable context', async () => {
    const host = makeHost([makeTodo()])

    await host.onStackedKanbanDrop({ item: document.createElement('div'), to: null })

    expect(updateTodo).not.toHaveBeenCalled()
  })
})

describe('the Done column and the completion checkbox', () => {
  let updateTodo

  beforeEach(() => {
    updateTodo = vi.fn().mockResolvedValue(undefined)
    window.api = {
      updateTodo,
      getTodos: vi.fn().mockResolvedValue([]),
      createNextRecurrence: vi.fn().mockResolvedValue(undefined)
    }
  })

  it('ticks the box when a card is dropped into the Done column', async () => {
    const todo = makeTodo({ status_id: 10, completed: false })
    const host = makeHost([todo], STATUSES_WITH_DONE)

    await host.onKanbanDropStatus(endEvent(todo, { statusId: '30' }))

    expect(updateTodo).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, status_id: 30, completed: true })
    )
  })

  it('unticks the box when a card is dragged out of the Done column', async () => {
    const todo = makeTodo({ status_id: 30, completed: true })
    const host = makeHost([todo], STATUSES_WITH_DONE)

    await host.onKanbanDropStatus(endEvent(todo, { statusId: '' }))

    expect(updateTodo).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, status_id: null, completed: false })
    )
  })

  it('ticks the box on the grouped board too', async () => {
    const todo = makeTodo({ project_id: 5, status_id: 10, completed: false })
    const host = makeHost([todo], STATUSES_WITH_DONE)

    await host.onStackedKanbanDrop(endEvent(todo, { projectId: '7', statusId: '30' }))

    expect(updateTodo).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, project_id: 7, status_id: 30, completed: true })
    )
  })

  it('leaves the box alone when no status is named Done', async () => {
    const todo = makeTodo({ status_id: 10, completed: false })
    const host = makeHost([todo])

    await host.onKanbanDropStatus(endEvent(todo, { statusId: '20' }))

    expect(updateTodo).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, status_id: 20, completed: false })
    )
  })

  it('moves a ticked card into the Done column from the checkbox', async () => {
    const todo = makeTodo({ status_id: 10, completed: false })
    const host = {
      ...makeHost([todo], STATUSES_WITH_DONE),
      projectsComposable: { setAllTodos: vi.fn() }
    }

    await host.toggleComplete(todo)

    expect(updateTodo).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, status_id: 30, completed: true })
    )
  })
})

// The "Show done" flag reaches the view as `showCompleted`. Completed cards are
// already filtered out upstream when it is off, so the Done column would only
// ever be empty; the view drops it from both layouts instead.
describe('KanbanView Done column visibility', () => {
  const stubs = { draggable: { template: '<div />' } }

  function columnNames(wrapper) {
    return wrapper.findAll('.column-header h3').map((el) => el.text())
  }

  it('hides the Done column on the status board when showCompleted is off', () => {
    const wrapper = mount(KanbanView, {
      props: { statuses: STATUSES_WITH_DONE, showCompleted: false, allTodos: [] },
      global: { stubs }
    })
    expect(columnNames(wrapper)).toEqual(['No Status', 'Todo', 'Doing'])
  })

  it('shows the Done column on the status board when showCompleted is on', () => {
    const wrapper = mount(KanbanView, {
      props: { statuses: STATUSES_WITH_DONE, showCompleted: true, allTodos: [] },
      global: { stubs }
    })
    expect(columnNames(wrapper)).toEqual(['No Status', 'Todo', 'Doing', 'Done'])
  })

  it('hides the Done column in every grouped-board section when showCompleted is off', () => {
    const wrapper = mount(KanbanView, {
      props: {
        groupByProject: true,
        isProjectSelected: false,
        statuses: STATUSES_WITH_DONE,
        showCompleted: false,
        groupedTodos: [
          { id: 'inbox', name: 'Inbox', color: '#666', todos: [] },
          { id: 5, name: 'Work', color: '#f00', todos: [] }
        ],
        allTodos: []
      },
      global: { stubs }
    })
    expect(columnNames(wrapper)).toEqual([
      'No Status',
      'Todo',
      'Doing',
      'No Status',
      'Todo',
      'Doing'
    ])
  })

  it('keeps every column when no status is named Done', () => {
    const wrapper = mount(KanbanView, {
      props: { statuses: STATUSES, showCompleted: false, allTodos: [] },
      global: { stubs }
    })
    expect(columnNames(wrapper)).toEqual(['No Status', 'Todo', 'Doing'])
  })
})

const draggableStub = {
  props: ['modelValue'],
  template:
    '<div><template v-for="element in modelValue" :key="element.id"><slot name="item" :element="element" /></template></div>'
}

// A mouse-down anywhere on the board that is not a card clears the selection
// (see docs/selection.md).
describe('KanbanView canvas click', () => {
  function mountBoard() {
    return mount(KanbanView, {
      props: { statuses: STATUSES, allTodos: [makeTodo({ status_id: 10 })] },
      global: { stubs: { draggable: draggableStub } }
    })
  }

  it('emits clear-selection on a mouse-down on the board', async () => {
    const wrapper = mountBoard()
    await wrapper.get('.column-header').trigger('mousedown')
    expect(wrapper.emitted('clear-selection')).toHaveLength(1)
  })

  it('does not emit clear-selection on a mouse-down on a card', async () => {
    const wrapper = mountBoard()
    await wrapper.get('.kanban-card').trigger('mousedown')
    expect(wrapper.emitted('clear-selection')).toBeUndefined()
  })
})

describe('clearSelection', () => {
  it('drops the multi-selection and the keyboard focus', () => {
    const host = makeHost([makeTodo()])
    host.todosComposable.selectedTodoIds.value = new Set([1])
    host.todosComposable.focusedTodoIndex.value = 0

    host.clearSelection()

    expect(host.todosComposable.selectedTodoIds.value.size).toBe(0)
    expect(host.todosComposable.focusedTodoIndex.value).toBe(-1)
  })

  it('is wired to both views by the application', () => {
    const app = readFileSync(resolve(import.meta.dirname, '../src/renderer/App.vue'), 'utf8')
    expect(app.match(/@clear-selection="clearSelection"/g)).toHaveLength(2)
  })
})
