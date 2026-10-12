// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import KanbanCard from '../src/renderer/components/KanbanCard.vue'
import NotesEditor from '../src/renderer/components/NotesEditor.vue'

function makeTodo(overrides = {}) {
  return {
    id: 1,
    title: 'Test todo',
    notes: '',
    notes_sensitive: 0,
    completed: 0,
    end_date: null,
    created_at: '2026-07-20T10:00:00',
    subtask_count: 0,
    ...overrides
  }
}

// A card must expand before its notes render, so tests click it first.
function expand(wrapper) {
  return wrapper.get('.kanban-card').trigger('click')
}

describe('KanbanCard', () => {
  it('renders the todo title', () => {
    const wrapper = mount(KanbanCard, { props: { todo: makeTodo() } })
    expect(wrapper.text()).toContain('Test todo')
  })

  it('hides notes flagged sensitive and shows the placeholder', async () => {
    const wrapper = mount(KanbanCard, {
      props: { todo: makeTodo({ notes: 'my secret plans', notes_sensitive: 1 }) }
    })
    await expand(wrapper)
    expect(wrapper.text()).toContain('Sensitive content hidden')
    expect(wrapper.html()).not.toContain('my secret plans')
  })

  it('renders non-sensitive notes as markdown', async () => {
    const wrapper = mount(KanbanCard, {
      props: { todo: makeTodo({ notes: 'plain note text' }) }
    })
    await expand(wrapper)
    expect(wrapper.html()).toContain('plain note text')
    expect(wrapper.text()).not.toContain('Sensitive content hidden')
  })

  it('emits toggle-complete when the checkbox is clicked', async () => {
    const wrapper = mount(KanbanCard, { props: { todo: makeTodo() } })
    await wrapper.get('input[type="checkbox"]').trigger('click')
    expect(wrapper.emitted('toggle-complete')).toHaveLength(1)
  })

  it('emits select when the card body is clicked', async () => {
    const wrapper = mount(KanbanCard, { props: { todo: makeTodo() } })
    await expand(wrapper)
    expect(wrapper.emitted('select')).toHaveLength(1)
  })

  it('marks an overdue card and formats the due date relatively', () => {
    const wrapper = mount(KanbanCard, {
      props: {
        todo: makeTodo({ end_date: '2020-01-01', project_name: 'Work', project_color: '#f00' })
      }
    })
    const deadline = wrapper.get('.card-deadline')
    expect(deadline.classes()).toContain('overdue')
  })

  it('shows a subtask progress bar when subtasks exist', () => {
    const wrapper = mount(KanbanCard, {
      props: { todo: makeTodo({ subtask_count: 4, subtask_completed: 2 }) }
    })
    expect(wrapper.find('.subtask-bar').exists()).toBe(true)
    expect(wrapper.text()).toContain('2/4')
  })
})

// Kanban cards share cardInteractionsMixin with the cards view, so the rule
// that a window blur does not end an edit session applies here too.
describe('KanbanCard editing across an application switch', () => {
  // The card teleports its context menu to '.app', so the test DOM needs one.
  let app

  beforeEach(() => {
    app = document.createElement('div')
    app.className = 'app'
    document.body.appendChild(app)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    app.remove()
  })

  it('keeps the title editor open when the window loses focus', async () => {
    const wrapper = mount(KanbanCard, { props: { todo: makeTodo() }, attachTo: app })
    await wrapper.get('.card-title').trigger('dblclick')
    const input = wrapper.get('.card-title-input')
    await input.setValue('Renamed todo')

    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    await input.trigger('blur')
    expect(wrapper.find('.card-title-input').exists()).toBe(true)
    expect(wrapper.emitted('update-title')).toBeUndefined()

    hasFocus.mockReturnValue(true)
    await wrapper.get('.card-title-input').trigger('blur')
    expect(wrapper.find('.card-title-input').exists()).toBe(false)
    expect(wrapper.emitted('update-title')[0]).toEqual(['Renamed todo'])
    wrapper.unmount()
  })

  it('keeps the notes editor open when the window loses focus', async () => {
    const wrapper = mount(KanbanCard, {
      props: { todo: makeTodo({ notes: 'plain note text' }) },
      attachTo: app
    })
    await expand(wrapper)
    await wrapper.get('.card-notes-preview .markdown-body').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const editor = wrapper.findComponent(NotesEditor)
    editor.vm.$emit('update:modelValue', 'edited note text')
    await wrapper.vm.$nextTick()

    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    editor.vm.$emit('blur')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.cm-container').exists()).toBe(true)
    expect(wrapper.emitted('update-notes')).toBeUndefined()
    wrapper.unmount()
  })
})

// KanbanCard shares the title/collapse interaction with CardItem.
describe('KanbanCard title clicks do not disturb the card', () => {
  it('does not collapse or select the card when the title is clicked', async () => {
    const wrapper = mount(KanbanCard, { props: { todo: makeTodo() } })
    const before = wrapper.vm.isCollapsed

    await wrapper.get('.card-title').trigger('click')

    expect(wrapper.vm.isCollapsed).toBe(before)
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('still opens the rename box on a double-click', async () => {
    const wrapper = mount(KanbanCard, { props: { todo: makeTodo() } })
    await wrapper.get('.card-title').trigger('click')
    await wrapper.get('.card-title').trigger('dblclick')

    expect(wrapper.find('.card-title-input').exists()).toBe(true)
  })
})

describe('KanbanCard full-screen button', () => {
  it('emits open-fullscreen without selecting the card', async () => {
    const wrapper = mount(KanbanCard, { props: { todo: makeTodo() } })
    await wrapper.get('.fullscreen-btn').trigger('click')
    expect(wrapper.emitted('open-fullscreen')).toHaveLength(1)
    expect(wrapper.emitted('select')).toBeUndefined()
    expect(wrapper.emitted('toggle-complete')).toBeUndefined()
  })
})
