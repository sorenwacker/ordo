// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HomeLanding from '../src/renderer/components/HomeLanding.vue'

// The overview tiles badge what is still open, like the sidebar rows (see
// docs/sidebar.md).
describe('HomeLanding project tiles', () => {
  const projects = [
    { id: 1, name: 'Open work', color: '#f00' },
    { id: 2, name: 'Finished', color: '#0f0' },
    { id: 3, name: 'Empty', color: '#00f' }
  ]

  it('shows only the open count and no badge at zero', () => {
    const wrapper = mount(HomeLanding, {
      props: { projects, projectCounts: { 1: { done: 3, total: 8 }, 2: { done: 8, total: 8 } } }
    })
    const tiles = wrapper.findAll('.project-drop-target').map((tile) => ({
      name: tile.get('.project-name').text(),
      badge: tile.find('.project-count').exists() ? tile.get('.project-count').text() : null
    }))
    expect(tiles).toEqual([
      { name: 'Open work', badge: '5' },
      { name: 'Finished', badge: null },
      { name: 'Empty', badge: null }
    ])
  })
})
