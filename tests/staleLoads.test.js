// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { useTodos } from '../src/renderer/composables/useTodos.js'
import KanbanView from '../src/renderer/components/KanbanView.vue'
import ItemPreview from '../src/renderer/components/ItemPreview.vue'

function deferred() {
  let resolve
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}

describe('loadTodos', () => {
  afterEach(() => {
    delete window.api
  })

  it('ignores a response that arrives after a newer request', async () => {
    const slow = deferred()
    const fast = deferred()
    window.api = { getTodos: vi.fn((filter) => (filter === 1 ? slow.promise : fast.promise)) }
    const { loadTodos, todos } = useTodos()

    const first = loadTodos(1)
    const second = loadTodos(2)
    fast.resolve([{ id: 20 }])
    await second
    slow.resolve([{ id: 10 }])
    await first

    expect(todos.value.map((t) => t.id)).toEqual([20])
  })

  it('keeps the list while reloading the same filter', async () => {
    const reload = deferred()
    window.api = { getTodos: vi.fn().mockResolvedValueOnce([{ id: 1 }]) }
    const { loadTodos, todos } = useTodos()
    await loadTodos('inbox')

    window.api.getTodos = vi.fn(() => reload.promise)
    const pending = loadTodos('inbox')
    expect(todos.value.map((t) => t.id)).toEqual([1])
    reload.resolve([{ id: 1 }, { id: 2 }])
    await pending
    expect(todos.value).toHaveLength(2)
  })
})

describe('KanbanView No Status column', () => {
  it('follows the order of allTodos and hides deleted cards', () => {
    const allTodos = [
      { id: 2, title: 'b' },
      { id: 1, title: 'a' },
      { id: 3, title: 'gone', deleted: true },
      { id: 4, title: 'has status', status_id: 7 }
    ]
    const wrapper = mount(KanbanView, {
      props: { allTodos, statuses: [{ id: 7, name: 'Todo' }] },
      shallow: true
    })
    expect(wrapper.vm.noStatusColumnTodos.map((t) => t.id)).toEqual([2, 1])
  })
})

describe('ItemPreview due date', () => {
  it('labels a date-only due date by the local calendar day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 7, 23, 30))
    try {
      const wrapper = mount(ItemPreview, {
        props: { item: { title: 't', end_date: '2026-11-07' }, position: { x: 0, y: 0 } }
      })
      expect(wrapper.find('.tooltip-deadline').text()).toBe('Due: Today')
    } finally {
      vi.useRealTimers()
    }
  })
})
