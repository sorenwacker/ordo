// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AppSidebar from '../src/renderer/components/AppSidebar.vue'

// The add-project and add-status inputs discard their text on blur. Switching
// to another application must not count as leaving them (see docs/editing.md).
describe('AppSidebar add inputs across an application switch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps a half-typed project name when the window loses focus', async () => {
    const wrapper = mount(AppSidebar, { attachTo: document.body })
    await wrapper.get('.add-project button').trigger('click')
    const input = wrapper.get('.add-project input')
    await input.setValue('New project')

    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    await input.trigger('blur')
    expect(wrapper.find('.add-project input').exists()).toBe(true)
    expect(wrapper.get('.add-project input').element.value).toBe('New project')

    hasFocus.mockReturnValue(true)
    await wrapper.get('.add-project input').trigger('blur')
    expect(wrapper.find('.add-project input').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps a half-typed status name when the window loses focus', async () => {
    const wrapper = mount(AppSidebar, { attachTo: document.body })
    await wrapper.get('.add-status button').trigger('click')
    const input = wrapper.get('.add-status input')
    await input.setValue('Blocked')

    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    await input.trigger('blur')
    expect(wrapper.get('.add-status input').element.value).toBe('Blocked')
    wrapper.unmount()
  })
})

// Badges count what is still open; the done count was noise on every row that
// had any (see docs/sidebar.md).
describe('AppSidebar count badges', () => {
  const projects = [
    { id: 1, name: 'Open work', color: '#f00' },
    { id: 2, name: 'Finished', color: '#0f0' }
  ]
  const stubs = {
    draggable: {
      props: ['modelValue'],
      template:
        '<div><template v-for="element in modelValue" :key="element.id"><slot name="item" :element="element" /></template></div>'
    }
  }

  function badges(wrapper) {
    return wrapper.findAll('.project-item').map((row) => ({
      name: row.get('.project-name').text(),
      badge: row.find('.count').exists() ? row.get('.count').text() : null
    }))
  }

  it('shows only the open count on a project row', () => {
    const wrapper = mount(AppSidebar, {
      props: { projects, projectCounts: { 1: { done: 3, total: 8 }, 2: { done: 8, total: 8 } } },
      global: { stubs }
    })
    expect(badges(wrapper)).toEqual([
      { name: 'Open work', badge: '5' },
      { name: 'Finished', badge: null }
    ])
  })

  it('shows the open count on the All row and hides it at zero', () => {
    const open = mount(AppSidebar, {
      props: { allCount: { done: 44, total: 112 } },
      global: { stubs }
    })
    expect(open.get('.nav-item .count').text()).toBe('68')

    const empty = mount(AppSidebar, {
      props: { allCount: { done: 5, total: 5 } },
      global: { stubs }
    })
    expect(empty.find('.nav-item .count').exists()).toBe(false)
  })
})
