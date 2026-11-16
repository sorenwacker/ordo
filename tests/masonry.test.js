// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import CardsView from '../src/renderer/components/CardsView.vue'
import { rowSpan } from '../src/renderer/utils/masonry.js'

// The cards grid is masonry by row spans: the grid has 1px implicit rows and
// each card spans as many as its rendered height needs, so columns pack on
// their own (see docs/cards.md). A ResizeObserver per card sets the span.

describe('rowSpan', () => {
  it('covers the height with 1px rows 16px apart', () => {
    // N rows cover N + (N - 1) * 16 pixels.
    expect(rowSpan(61, 1, 16)).toBe(5) // 5 rows = 69px
    expect(rowSpan(251, 1, 16)).toBe(16) // 16 rows = 256px; 15 would be 239px
    expect(rowSpan(18, 1, 16)).toBe(2) // exact fit
  })

  it('never returns less than one row', () => {
    expect(rowSpan(0, 1, 16)).toBe(1)
  })

  it('works with any row unit and gap', () => {
    expect(rowSpan(100, 10, 0)).toBe(10)
    expect(rowSpan(101, 10, 0)).toBe(11)
  })
})

// jsdom has no ResizeObserver; this stand-in records what is observed and lets
// a test deliver a size.
class FakeResizeObserver {
  static instances = []
  constructor(callback) {
    this.callback = callback
    this.observed = new Set()
    FakeResizeObserver.instances.push(this)
  }
  observe(el) {
    this.observed.add(el)
  }
  unobserve(el) {
    this.observed.delete(el)
  }
  disconnect() {
    this.observed.clear()
  }
  resize(el, blockSize) {
    this.callback([{ target: el, borderBoxSize: [{ blockSize, inlineSize: 400 }] }])
  }
}

// Stands in for vuedraggable; its root is the grid the cards sit in.
const gridStub = (style) => ({
  props: ['modelValue'],
  template: `<div style="${style}"><template v-for="element in modelValue" :key="element.id"><slot name="item" :element="element" /></template></div>`
})

const todos = [
  { id: 1, title: 'Short', notes: '', completed: 0, project_id: null },
  { id: 2, title: 'Long', notes: 'x', completed: 0, project_id: null }
]

describe('v-masonry-item', () => {
  let realResizeObserver

  beforeAll(() => {
    realResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = FakeResizeObserver
  })

  afterAll(() => {
    globalThis.ResizeObserver = realResizeObserver
  })

  const observer = () => FakeResizeObserver.instances.at(-1)

  it('observes every card and spans it to its reported height', () => {
    const wrapper = mount(CardsView, {
      props: { sortedTodos: todos, projects: [] },
      global: { stubs: { draggable: gridStub('display: grid; grid-auto-rows: 1px; row-gap: 16px') } }
    })
    const cards = wrapper.findAll('.todo-card').map((c) => c.element)
    expect(cards).toHaveLength(2)
    expect(observer().observed).toEqual(new Set(cards))

    observer().resize(cards[0], 61)
    observer().resize(cards[1], 251)
    expect(cards[0].style.gridRowEnd).toBe('span 5')
    expect(cards[1].style.gridRowEnd).toBe('span 16')

    // A later height change moves the span with it.
    observer().resize(cards[1], 61)
    expect(cards[1].style.gridRowEnd).toBe('span 5')
    wrapper.unmount()
  })

  it('stops observing a card that leaves the grid', async () => {
    const wrapper = mount(CardsView, {
      props: { sortedTodos: todos, projects: [] },
      global: { stubs: { draggable: gridStub('display: grid; grid-auto-rows: 1px; row-gap: 16px') } }
    })
    const [first, second] = wrapper.findAll('.todo-card').map((c) => c.element)
    await wrapper.setProps({ sortedTodos: todos.slice(1) })
    expect(observer().observed.has(first)).toBe(false)
    expect(observer().observed.has(second)).toBe(true)
    wrapper.unmount()
    expect(observer().observed.has(second)).toBe(false)
  })

  it('sets no span in a container that is not a row grid', () => {
    const wrapper = mount(CardsView, {
      props: { sortedTodos: todos, projects: [] },
      global: { stubs: { draggable: gridStub('display: flex; flex-direction: column') } }
    })
    const [card] = wrapper.findAll('.todo-card').map((c) => c.element)
    observer().resize(card, 61)
    expect(card.style.gridRowEnd).toBe('')
    wrapper.unmount()
  })
})

describe('masonry layout source', () => {
  const src = resolve(import.meta.dirname, '../src/renderer')

  it('has no timers: the observer alone drives the layout', () => {
    const masonry = readFileSync(resolve(src, 'utils/masonry.js'), 'utf8')
    expect(masonry).not.toMatch(/setTimeout|setInterval|requestAnimationFrame|nextTick/)
  })

  it('takes the row unit from the stylesheet, where the gap also lives', () => {
    const css = readFileSync(resolve(src, 'styles/views.css'), 'utf8')
    expect(css).toMatch(/\.cards-grid\.masonry\s*\{[^}]*grid-auto-rows:\s*1px/)
  })
})
