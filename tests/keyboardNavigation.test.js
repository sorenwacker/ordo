import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import keyboardShortcutsMixin from '../src/renderer/mixins/keyboardShortcutsMixin.js'
import { navigationOrder } from '../src/renderer/utils/navigation.js'

const a = { id: 1, title: 'a', completed: 0 }
const done = { id: 2, title: 'done', completed: 1 }
const b = { id: 3, title: 'b', completed: 0 }

// The mixin is driven through a plain host object so the test states exactly
// which list it is handed: the raw list still holds the hidden done card, the
// rendered list does not.
function makeHost(overrides = {}) {
  return {
    todos: [a, done, b],
    navigableTodos: [a, b],
    focusedTodoIndex: 0,
    showGlobalSearch: false,
    showHelpModal: false,
    selectTodo: vi.fn(),
    toggleComplete: vi.fn(),
    deleteTodo: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    $refs: {},
    ...overrides
  }
}

function press(host, key, extra = {}) {
  keyboardShortcutsMixin.methods.handleKeyDown.call(host, {
    key,
    target: { tagName: 'DIV', isContentEditable: false },
    preventDefault() {},
    stopPropagation() {},
    ...extra
  })
}

describe('navigationOrder', () => {
  it('is the sorted list when cards are not grouped', () => {
    const sorted = [b, a]
    expect(navigationOrder({ groupByProject: false, groupedTodos: [], sortedTodos: sorted })).toBe(
      sorted
    )
  })

  it('walks the groups in order when cards are grouped by project', () => {
    const groups = [{ todos: [b] }, { todos: [a] }]
    expect(
      navigationOrder({ groupByProject: true, groupedTodos: groups, sortedTodos: [a, b] })
    ).toEqual([b, a])
  })
})

describe('keyboard navigation follows the rendered list', () => {
  it('reaches the next rendered card in one press past a hidden done card', () => {
    const host = makeHost()
    press(host, 'ArrowDown')
    expect(host.selectTodo).toHaveBeenCalledWith(b.id)
    expect(host.focusedTodoIndex).toBe(1)
  })

  it('does the same for j and for Cmd-ArrowDown', () => {
    for (const [key, extra] of [
      ['j', {}],
      ['ArrowDown', { metaKey: true }]
    ]) {
      const host = makeHost()
      press(host, key, extra)
      expect(host.selectTodo, key).toHaveBeenCalledWith(b.id)
    }
  })

  it('moves up through the rendered list', () => {
    const host = makeHost({ focusedTodoIndex: 1 })
    press(host, 'k')
    expect(host.selectTodo).toHaveBeenCalledWith(a.id)
    press(host, 'ArrowUp', { metaKey: true })
    expect(host.focusedTodoIndex).toBe(0)
  })

  it('stops at the end of the rendered list, not the raw one', () => {
    const host = makeHost({ focusedTodoIndex: 1 })
    press(host, 'ArrowDown')
    expect(host.focusedTodoIndex).toBe(1)
    expect(host.selectTodo).toHaveBeenCalledWith(b.id)
  })

  it('toggles, opens and deletes the rendered card under the focus', () => {
    const host = makeHost({ focusedTodoIndex: 1 })
    press(host, 'x')
    expect(host.toggleComplete).toHaveBeenCalledWith(b)
    press(host, 'Enter')
    expect(host.selectTodo).toHaveBeenCalledWith(b.id)
    press(host, 'Delete')
    expect(host.deleteTodo).toHaveBeenCalledWith(b.id)
  })

  it('does nothing when nothing is rendered, even if the raw list is not empty', () => {
    const host = makeHost({ navigableTodos: [], focusedTodoIndex: -1 })
    press(host, 'ArrowDown')
    expect(host.selectTodo).not.toHaveBeenCalled()
    expect(host.focusedTodoIndex).toBe(-1)
  })
})

describe('only the rendered list is indexed by the focus', () => {
  const read = (file) => readFileSync(resolve(import.meta.dirname, '..', file), 'utf8')

  it('the mixin never reads the raw todos list', () => {
    expect(read('src/renderer/mixins/keyboardShortcutsMixin.js')).not.toMatch(/this\.todos\b/)
  })

  it('the application resolves the focus and a selection through navigableTodos', () => {
    const app = read('src/renderer/App.vue')
    expect(app).toMatch(/navigableTodos\(\)\s*\{[^}]*navigationOrder\(/)
    expect(app).not.toMatch(/this\.todos\[this\.focusedTodoIndex\]/)
    expect(app).not.toMatch(/this\.todos\.findIndex/)
  })
})
