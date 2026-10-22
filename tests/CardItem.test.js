// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import CardItem from '../src/renderer/components/CardItem.vue'
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
    ...overrides
  }
}

// Cards start collapsed; notes only render once expanded by a click on the card.

describe('CardItem', () => {
  it('renders the todo title', () => {
    const wrapper = mount(CardItem, { props: { todo: makeTodo() } })
    expect(wrapper.text()).toContain('Test todo')
  })

  it('hides notes flagged sensitive and shows the placeholder', async () => {
    const wrapper = mount(CardItem, {
      props: { todo: makeTodo({ notes: 'my secret plans', notes_sensitive: 1 }) }
    })
    await wrapper.trigger('click')
    expect(wrapper.text()).toContain('Sensitive content hidden')
    expect(wrapper.html()).not.toContain('my secret plans')
  })

  it('renders non-sensitive notes as markdown', async () => {
    const wrapper = mount(CardItem, {
      props: { todo: makeTodo({ notes: 'plain note text' }) }
    })
    await wrapper.trigger('click')
    expect(wrapper.html()).toContain('plain note text')
    expect(wrapper.text()).not.toContain('Sensitive content hidden')
  })

  it('opens a focused notes editor when the rendered notes are clicked', async () => {
    // The card teleports its context menu to '.app', so the test DOM needs one.
    const app = document.createElement('div')
    app.className = 'app'
    document.body.appendChild(app)
    const wrapper = mount(CardItem, {
      props: { todo: makeTodo({ notes: 'plain note text' }) },
      attachTo: app
    })
    await wrapper.trigger('click')
    await wrapper.get('.card-notes-preview .markdown-body').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.cm-container').exists()).toBe(true)
    expect(wrapper.element.contains(document.activeElement)).toBe(true)
    wrapper.unmount()
    app.remove()
  })

  it('does not open the notes editor when the click ends a text selection', async () => {
    const wrapper = mount(CardItem, { props: { todo: makeTodo({ notes: 'plain note text' }) } })
    await wrapper.trigger('click')
    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      toString: () => 'note'
    })
    await wrapper.get('.card-notes-preview .markdown-body').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.cm-container').exists()).toBe(false)
    vi.restoreAllMocks()
    wrapper.unmount()
  })

  it('emits toggle-complete when the checkbox is clicked', async () => {
    const wrapper = mount(CardItem, { props: { todo: makeTodo() } })
    await wrapper.get('input[type="checkbox"]').trigger('click')
    expect(wrapper.emitted('toggle-complete')).toHaveLength(1)
  })

  it('emits update-title with the edited value', async () => {
    const wrapper = mount(CardItem, { props: { todo: makeTodo() } })
    await wrapper.get('.card-title').trigger('dblclick')
    const input = wrapper.get('.card-title-input')
    await input.setValue('Renamed todo')
    await input.trigger('keydown.enter')
    expect(wrapper.emitted('update-title')[0]).toEqual(['Renamed todo'])
  })

  it('does not emit update-title when the title is unchanged', async () => {
    const wrapper = mount(CardItem, { props: { todo: makeTodo({ title: 'Same' }) } })
    await wrapper.get('.card-title').trigger('dblclick')
    await wrapper.get('.card-title-input').trigger('keydown.enter')
    expect(wrapper.emitted('update-title')).toBeUndefined()
  })

  // The context menu is teleported to `.app`; stub Teleport so it renders inline.
  const teleportStub = { global: { stubs: { teleport: true } } }

  it('opens a context menu on right-click', async () => {
    const wrapper = mount(CardItem, { props: { todo: makeTodo() }, ...teleportStub })
    expect(wrapper.find('.card-context-menu').exists()).toBe(false)
    await wrapper.trigger('contextmenu')
    expect(wrapper.find('.card-context-menu').exists()).toBe(true)
  })

  it('emits set-due-date from the context menu Today preset', async () => {
    const wrapper = mount(CardItem, { props: { todo: makeTodo() }, ...teleportStub })
    await wrapper.trigger('contextmenu')
    const today = wrapper.findAll('.context-menu-item').find((n) => n.text() === 'Today')
    await today.trigger('click')
    expect(wrapper.emitted('set-due-date')).toHaveLength(1)
    expect(wrapper.emitted('set-due-date')[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// A blur is how an inline editor decides the user is done - except when the
// blur comes from the whole window losing focus (see docs/editing.md).
describe('CardItem editing across an application switch', () => {
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

  it('keeps the title editor open and refocuses it when the window loses focus', async () => {
    const wrapper = mount(CardItem, { props: { todo: makeTodo() }, attachTo: app })
    await wrapper.get('.card-title').trigger('dblclick')
    await wrapper.vm.$nextTick()
    const input = wrapper.get('.card-title-input')
    await input.setValue('Renamed todo')

    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    input.element.blur()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.card-title-input').exists()).toBe(true)
    expect(wrapper.emitted('update-title')).toBeUndefined()

    window.dispatchEvent(new Event('focus'))
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    expect(document.activeElement).toBe(wrapper.get('.card-title-input').element)
    wrapper.unmount()
  })

  it('still saves the title on a blur inside the focused window', async () => {
    const wrapper = mount(CardItem, { props: { todo: makeTodo() }, attachTo: app })
    await wrapper.get('.card-title').trigger('dblclick')
    const input = wrapper.get('.card-title-input')
    await input.setValue('Renamed todo')

    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    await input.trigger('blur')
    expect(wrapper.find('.card-title-input').exists()).toBe(false)
    expect(wrapper.emitted('update-title')[0]).toEqual(['Renamed todo'])
    wrapper.unmount()
  })

  it('keeps the notes editor open when the window loses focus, and saves once it returns', async () => {
    const wrapper = mount(CardItem, {
      props: { todo: makeTodo({ notes: 'plain note text' }) },
      attachTo: app
    })
    await wrapper.trigger('click')
    await wrapper.get('.card-notes-preview .markdown-body').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const editor = wrapper.findComponent(NotesEditor)
    editor.vm.$emit('update:modelValue', 'edited note text')
    await wrapper.vm.$nextTick()

    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    editor.vm.$emit('blur')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.cm-container').exists()).toBe(true)
    expect(wrapper.emitted('update-notes')).toBeUndefined()

    hasFocus.mockReturnValue(true)
    wrapper.findComponent(NotesEditor).vm.$emit('blur')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.cm-container').exists()).toBe(false)
    expect(wrapper.emitted('update-notes')[0]).toEqual(['edited note text'])
    wrapper.unmount()
  })
})

// A double-click on the title must open the rename box. The first click of that
// pair used to reach the card, toggle it, and reflow the masonry grid, moving
// the title out from under the pointer before the second click landed.
describe('CardItem title clicks do not disturb the card', () => {
  it('does not collapse or select the card when the title is clicked', async () => {
    const wrapper = mount(CardItem, { props: { todo: makeTodo() } })
    const before = wrapper.vm.isCollapsed

    await wrapper.get('.card-title').trigger('click')

    expect(wrapper.vm.isCollapsed).toBe(before)
    expect(wrapper.emitted('click')).toBeUndefined()
  })

  it('still opens the rename box on a double-click', async () => {
    const wrapper = mount(CardItem, { props: { todo: makeTodo() } })
    await wrapper.get('.card-title').trigger('click')
    await wrapper.get('.card-title').trigger('dblclick')

    expect(wrapper.find('.card-title-input').exists()).toBe(true)
  })

  it('still expands the card when the body is clicked', async () => {
    const wrapper = mount(CardItem, { props: { todo: makeTodo() } })
    const before = wrapper.vm.isCollapsed

    await wrapper.trigger('click')

    expect(wrapper.vm.isCollapsed).toBe(!before)
    expect(wrapper.emitted('click')).toHaveLength(1)
  })
})

describe('CardItem full-screen button', () => {
  it('emits open-fullscreen without selecting the card', async () => {
    const wrapper = mount(CardItem, { props: { todo: makeTodo() } })
    await wrapper.get('.fullscreen-btn').trigger('click')
    expect(wrapper.emitted('open-fullscreen')).toHaveLength(1)
    expect(wrapper.emitted('click')).toBeUndefined()
    expect(wrapper.emitted('toggle-complete')).toBeUndefined()
  })

  it('keeps the button in the trash and archive views', () => {
    for (const props of [{ isTrashView: true }, { isArchiveView: true }]) {
      const wrapper = mount(CardItem, { props: { todo: makeTodo(), ...props } })
      expect(wrapper.find('.fullscreen-btn').exists()).toBe(true)
    }
  })
})
