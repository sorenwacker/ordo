// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isCanvasMouseDown } from '../src/renderer/utils/canvas.js'
import { useTodos } from '../src/renderer/composables/useTodos.js'

function mouseDown(target, overrides = {}) {
  return { button: 0, clientX: 5, clientY: 5, target, ...overrides }
}

function element(html) {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

describe('isCanvasMouseDown', () => {
  it('accepts a primary press on empty space', () => {
    expect(isCanvasMouseDown(mouseDown(element('<div class="canvas"></div>')))).toBe(true)
  })

  it('rejects a press on a card or a control, including their descendants', () => {
    for (const html of [
      '<div class="todo-card"><span class="t"></span></div>',
      '<div class="kanban-card"><span class="t"></span></div>',
      '<button><span class="t"></span></button>',
      '<a href="#"><span class="t"></span></a>'
    ]) {
      const target = element(html).querySelector('.t')
      expect(isCanvasMouseDown(mouseDown(target)), html).toBe(false)
    }
  })

  it('rejects a secondary-button press', () => {
    expect(isCanvasMouseDown(mouseDown(element('<div></div>'), { button: 2 }))).toBe(false)
  })

  it('rejects a press on the scrollbar of a scrolling element', () => {
    const scroller = element('<div></div>')
    Object.defineProperty(scroller, 'clientWidth', { value: 200 })
    Object.defineProperty(scroller, 'clientHeight', { value: 100 })
    scroller.getBoundingClientRect = () => ({ left: 0, top: 0 })
    expect(isCanvasMouseDown(mouseDown(scroller, { clientX: 50, clientY: 50 }))).toBe(true)
    expect(isCanvasMouseDown(mouseDown(scroller, { clientX: 205, clientY: 50 }))).toBe(false)
    expect(isCanvasMouseDown(mouseDown(scroller, { clientX: 50, clientY: 105 }))).toBe(false)
  })
})

describe('selection writes', () => {
  const todos = useTodos()

  it('replaces the multi-selection from a marquee', () => {
    todos.setSelectedTodoIds([4, 5])
    expect([...todos.selectedTodoIds.value]).toEqual([4, 5])
  })

  it('toggles one id for Cmd-click', () => {
    todos.setSelectedTodoIds([1])
    todos.toggleSelectedTodoId(2)
    expect([...todos.selectedTodoIds.value]).toEqual([1, 2])
    todos.toggleSelectedTodoId(1)
    expect([...todos.selectedTodoIds.value]).toEqual([2])
  })

  it('clears the multi-selection and the keyboard focus', () => {
    todos.setSelectedTodoIds([1, 2])
    todos.focusedTodoIndex.value = 1
    todos.clearSelection()
    expect(todos.selectedTodoIds.value.size).toBe(0)
    expect(todos.focusedTodoIndex.value).toBe(-1)
  })

  // The application exposes the selection through a read-only computed; an
  // assignment or in-place mutation there is dropped by Vue.
  it('is never written directly by the application', () => {
    const app = readFileSync(resolve(import.meta.dirname, '../src/renderer/App.vue'), 'utf8')
    expect(app).not.toMatch(/this\.selectedTodoIds\s*=/)
    expect(app).not.toMatch(/this\.selectedTodoIds\.(clear|add|delete)\(/)
  })
})
