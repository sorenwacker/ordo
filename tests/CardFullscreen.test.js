// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import CardFullscreen from '../src/renderer/components/CardFullscreen.vue'
import CardsView from '../src/renderer/components/CardsView.vue'
import KanbanView from '../src/renderer/components/KanbanView.vue'
import NotesEditor from '../src/renderer/components/NotesEditor.vue'
import { draggableStub } from './helpers/draggableStub.js'

function makeTodo(overrides = {}) {
  return {
    id: 1,
    title: 'Test todo',
    notes: '',
    notes_sensitive: 0,
    completed: 0,
    end_date: null,
    project_id: 5,
    project_name: 'Work',
    project_color: '#f00',
    status_id: null,
    deleted: 0,
    created_at: '2026-07-20T10:00:00',
    subtask_count: 0,
    ...overrides
  }
}

function press(key) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

// Every overlay owns a window keydown listener, so each one is unmounted
// after its case; a leaked overlay would swallow Escape for the cases after it.
const mounted = []
let app

function mountOverlay(props) {
  const wrapper = mount(CardFullscreen, { props, attachTo: app })
  mounted.push(wrapper)
  return wrapper
}

beforeEach(() => {
  app = document.createElement('div')
  app.className = 'app'
  document.body.appendChild(app)
  // Blur ends an edit only while the application window has focus.
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
})

afterEach(() => {
  while (mounted.length) mounted.pop().unmount()
  vi.restoreAllMocks()
  app.remove()
})

describe('CardFullscreen', () => {
  it('renders the title, project, due date and notes', () => {
    const wrapper = mountOverlay({
      todo: makeTodo({ notes: 'long note body', end_date: '2026-10-20' })
    })
    expect(wrapper.text()).toContain('Test todo')
    expect(wrapper.text()).toContain('Work')
    expect(wrapper.text()).toContain('Due:')
    expect(wrapper.html()).toContain('long note body')
  })

  it('never renders a sensitive note', () => {
    const wrapper = mountOverlay({
      todo: makeTodo({ notes: 'my secret plans', notes_sensitive: 1 })
    })
    expect(wrapper.text()).toContain('Sensitive content hidden')
    expect(wrapper.html()).not.toContain('my secret plans')
  })

  it('opens the notes editor on a click on the rendered notes', async () => {
    const wrapper = mountOverlay({ todo: makeTodo({ notes: 'note' }) })
    await wrapper.get('.fullscreen-notes .markdown-body').trigger('click')
    expect(wrapper.findComponent(NotesEditor).exists()).toBe(true)
  })

  it('emits update-notes when the editor is left', async () => {
    const wrapper = mountOverlay({ todo: makeTodo({ notes: 'note' }) })
    await wrapper.get('.fullscreen-notes .markdown-body').trigger('click')
    wrapper.findComponent(NotesEditor).vm.$emit('update:modelValue', 'changed')
    wrapper.findComponent(NotesEditor).vm.$emit('blur')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update-notes')).toEqual([['changed']])
    expect(wrapper.findComponent(NotesEditor).exists()).toBe(false)
  })

  it('emits update-title when the rename box is left', async () => {
    const wrapper = mountOverlay({ todo: makeTodo() })
    await wrapper.get('.fullscreen-title').trigger('dblclick')
    const input = wrapper.get('input.fullscreen-title-input')
    await input.setValue('Renamed')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update-title')).toEqual([['Renamed']])
  })

  it('closes on the close button', async () => {
    const wrapper = mountOverlay({ todo: makeTodo() })
    await wrapper.get('.fullscreen-close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('closes on a click on the backdrop but not on the content', async () => {
    const wrapper = mountOverlay({ todo: makeTodo() })
    await wrapper.get('.fullscreen-content').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()
    await wrapper.get('.card-fullscreen').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('saves an open notes editor before closing', async () => {
    const wrapper = mountOverlay({ todo: makeTodo({ notes: 'note' }) })
    await wrapper.get('.fullscreen-notes .markdown-body').trigger('click')
    wrapper.findComponent(NotesEditor).vm.$emit('update:modelValue', 'typed')
    await wrapper.get('.fullscreen-close').trigger('click')
    expect(wrapper.emitted('update-notes')).toEqual([['typed']])
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('closes on Escape when no editor is open', async () => {
    const wrapper = mountOverlay({ todo: makeTodo() })
    press('Escape')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('leaves the notes editor on the first Escape and closes on the second', async () => {
    const wrapper = mountOverlay({ todo: makeTodo({ notes: 'note' }) })
    await wrapper.get('.fullscreen-notes .markdown-body').trigger('click')
    wrapper.findComponent(NotesEditor).vm.$emit('update:modelValue', 'typed')
    press('Escape')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update-notes')).toEqual([['typed']])
    expect(wrapper.findComponent(NotesEditor).exists()).toBe(false)
    expect(wrapper.emitted('close')).toBeUndefined()
    press('Escape')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('discards a title edit on the first Escape without closing', async () => {
    const wrapper = mountOverlay({ todo: makeTodo() })
    await wrapper.get('.fullscreen-title').trigger('dblclick')
    await wrapper.get('input.fullscreen-title-input').setValue('Renamed')
    press('Escape')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('input.fullscreen-title-input').exists()).toBe(false)
    expect(wrapper.emitted('update-title')).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('keeps Escape from reaching other window listeners while open', () => {
    const other = vi.fn()
    window.addEventListener('keydown', other)
    mountOverlay({ todo: makeTodo() })
    press('Escape')
    expect(other).not.toHaveBeenCalled()
    mounted.pop().unmount()
    press('Escape')
    expect(other).toHaveBeenCalledTimes(1)
    window.removeEventListener('keydown', other)
  })
})

describe('full-screen stacking', () => {
  const css = ['base.css', 'content.css', 'components.css']
    .map((file) =>
      readFileSync(resolve(import.meta.dirname, '../src/renderer/styles', file), 'utf8')
    )
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')

  function zIndex(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const block = css.match(new RegExp(`(?:^|[{};])\\s*${escaped}\\s*\\{([^}]*)\\}`))
    const value = block?.[1].match(/z-index\s*:\s*(\d+)/)
    return value ? Number(value[1]) : null
  }

  // The header, the sidebar and its toggle each have a z-index of their own;
  // the overlay must sit above every one of them or it is drawn through.
  it('stacks the overlay above the header and the sidebar', () => {
    const overlay = zIndex('.card-fullscreen')
    expect(overlay).not.toBeNull()
    for (const selector of [
      '.main-header',
      '.sidebar',
      '.sidebar-toggle',
      '.sidebar-hover-trigger'
    ]) {
      expect(zIndex(selector), selector).toBeLessThan(overlay)
    }
  })
})

describe('full-screen wiring', () => {
  it('CardsView forwards open-fullscreen with the todo', async () => {
    const todo = makeTodo()
    const wrapper = mount(CardsView, {
      props: { sortedTodos: [todo], groupedTodos: [], projects: [] },
      global: { stubs: { draggable: draggableStub } }
    })
    await wrapper.get('.fullscreen-btn').trigger('click')
    expect(wrapper.emitted('open-fullscreen')).toEqual([[todo]])
  })

  it('KanbanView forwards open-fullscreen with the todo', async () => {
    const todo = makeTodo({ status_id: 10 })
    const wrapper = mount(KanbanView, {
      props: { statuses: [{ id: 10, name: 'Todo', color: '#aaa' }], allTodos: [todo] },
      global: { stubs: { draggable: draggableStub } }
    })
    await wrapper.get('.fullscreen-btn').trigger('click')
    expect(wrapper.emitted('open-fullscreen')).toEqual([[todo]])
  })

  it('App mounts the overlay and listens to both views', () => {
    const app = readFileSync(resolve(import.meta.dirname, '../src/renderer/App.vue'), 'utf8')
    expect(app).toContain('<CardFullscreen')
    expect(app.match(/@open-fullscreen=/g)).toHaveLength(2)
  })
})
