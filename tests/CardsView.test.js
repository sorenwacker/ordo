// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CardsView from '../src/renderer/components/CardsView.vue'
import { CARD_MIN_WIDTHS } from '../src/renderer/utils/cardWidth.js'

// The card grid is an auto-fill grid: the chosen minimum width reaches the CSS
// as --card-min-width and decides how many columns fit.
describe('CardsView card width', () => {
  it('publishes the chosen minimum card width on the grid', () => {
    const wrapper = mount(CardsView, {
      props: { sortedTodos: [], cardColumns: 3, cardMinWidth: CARD_MIN_WIDTHS.l }
    })
    expect(wrapper.get('.cards-grid').attributes('style')).toContain(
      `--card-min-width: ${CARD_MIN_WIDTHS.l}`
    )
  })
})

// The views render their cards through vuedraggable; this stub renders the
// item slot once per element so a real card is in the tree.
const draggableStub = {
  props: ['modelValue'],
  template:
    '<div><template v-for="element in modelValue" :key="element.id"><slot name="item" :element="element" /></template></div>'
}

// A mouse-down on empty space clears the selection; one on a card does not,
// since the card's own click handles selection (see docs/selection.md).
describe('CardsView canvas click', () => {
  const todo = { id: 1, title: 'A card', notes: '', completed: 0, project_id: null }

  function mountView() {
    return mount(CardsView, {
      props: { sortedTodos: [todo], projects: [] },
      global: { stubs: { draggable: draggableStub } }
    })
  }

  it('emits clear-selection on a mouse-down on the canvas', async () => {
    const wrapper = mountView()
    await wrapper.get('.cards-view').trigger('mousedown', { clientX: 5, clientY: 5 })
    expect(wrapper.emitted('clear-selection')).toHaveLength(1)
  })

  it('does not emit clear-selection on a mouse-down on a card', async () => {
    const wrapper = mountView()
    await wrapper.get('.todo-card').trigger('mousedown')
    expect(wrapper.emitted('clear-selection')).toBeUndefined()
  })
})
