import { presetDueDate, isOverdue, formatDeadline, formatCreatedDate } from '../utils/dueDates.js'
import { renderCardNotes } from '../utils/markdown.js'
import { isWindowUnfocused } from '../utils/windowFocus.js'
import { hasTextSelection } from '../utils/textSelection.js'

/**
 * Shared behavior for todo card components (CardItem, KanbanCard): date
 * formatting, note previews, inline title/notes editing, and the due-date
 * context menu.
 *
 * Host components must declare the `todo` prop and emit `update-title`,
 * `update-notes`, and `set-due-date`.
 */
export default {
  data() {
    return {
      isEditing: false,
      editingTitle: '',
      isCollapsed: true,
      isEditingNotes: false,
      editingNotes: '',
      contextMenuVisible: false,
      contextMenuStyle: { top: '0px', left: '0px' },
      // Set while a window focus listener is registered for an open editor.
      watchingWindowFocus: false
    }
  },
  computed: {
    dueDateValue() {
      return this.todo.end_date ? this.todo.end_date.split('T')[0] : ''
    }
  },
  mounted() {
    // Close this card's menu when any other card opens its own menu.
    document.addEventListener('close-card-menus', this.hideContextMenu)
  },
  beforeUnmount() {
    document.removeEventListener('close-card-menus', this.hideContextMenu)
    this.stopEditFocusWatch()
  },
  methods: {
    formatDeadline(dateString) {
      return formatDeadline(dateString)
    },
    isOverdue(dateString) {
      return isOverdue(dateString)
    },
    formatCreatedDate(dateString) {
      return formatCreatedDate(dateString)
    },
    renderCardNotes(notes) {
      return renderCardNotes(notes)
    },
    startEdit() {
      this.editingTitle = this.todo.title
      this.isEditing = true
      this.updateEditFocusWatch()
      this.$nextTick(() => this.$refs.titleInput?.focus())
    },
    onTitleBlur() {
      // Switching to another application blurs the input; the edit session
      // outlives it (see docs/editing.md).
      if (isWindowUnfocused()) return
      this.saveTitle()
    },
    saveTitle() {
      if (this.isEditing) {
        const newTitle = this.editingTitle.trim()
        if (newTitle && newTitle !== this.todo.title) {
          this.$emit('update-title', newTitle)
        }
        this.isEditing = false
        this.updateEditFocusWatch()
      }
    },
    cancelEdit() {
      this.isEditing = false
      this.editingTitle = ''
      this.updateEditFocusWatch()
    },
    startNotesEdit() {
      // The click that ends a drag-selection must not open the editor; the
      // user is copying text, not editing it (see docs/editing.md).
      if (hasTextSelection()) return
      this.editingNotes = this.todo.notes || ''
      this.isEditingNotes = true
      this.updateEditFocusWatch()
    },
    onNotesBlur() {
      if (isWindowUnfocused()) return
      this.saveNotes()
    },
    saveNotes() {
      if (this.isEditingNotes) {
        const newNotes = this.editingNotes
        if (newNotes !== this.todo.notes) {
          this.$emit('update-notes', newNotes)
        }
        this.isEditingNotes = false
        this.updateEditFocusWatch()
      }
    },
    updateEditFocusWatch() {
      // Listen for the window coming back only while this card has an open
      // editor, so the listener count follows open editors, not card count.
      if (this.isEditing || this.isEditingNotes) {
        if (!this.watchingWindowFocus) {
          window.addEventListener('focus', this.restoreEditFocus)
          this.watchingWindowFocus = true
        }
      } else {
        this.stopEditFocusWatch()
      }
    },
    stopEditFocusWatch() {
      if (!this.watchingWindowFocus) return
      window.removeEventListener('focus', this.restoreEditFocus)
      this.watchingWindowFocus = false
    },
    restoreEditFocus() {
      // Put the caret back where the user left it when the window returns.
      this.$nextTick(() => {
        if (this.isEditing) {
          this.$refs.titleInput?.focus()
        } else if (this.isEditingNotes) {
          this.$refs.notesEditor?.focus()
        }
      })
    },
    showContextMenu(event) {
      // Close any other open card menu so only one is visible at a time.
      document.dispatchEvent(new CustomEvent('close-card-menus'))
      // Fixed (viewport) coordinates: the menu is teleported out of the card.
      this.contextMenuStyle = {
        position: 'fixed',
        top: event.clientY + 'px',
        left: event.clientX + 'px'
      }
      this.contextMenuVisible = true
      this.$nextTick(() => this.clampContextMenu(event.clientX, event.clientY))
      // Close on click outside or on scroll.
      setTimeout(() => {
        document.addEventListener('click', this.hideContextMenu, { once: true })
        window.addEventListener('scroll', this.hideContextMenu, { once: true, capture: true })
      }, 0)
    },
    clampContextMenu(x, y) {
      const menu = this.$refs.contextMenu
      if (!menu) return
      const rect = menu.getBoundingClientRect()
      const pad = 8
      let left = x
      let top = y
      if (left + rect.width + pad > window.innerWidth) left = window.innerWidth - rect.width - pad
      if (top + rect.height + pad > window.innerHeight) top = window.innerHeight - rect.height - pad
      this.contextMenuStyle = {
        position: 'fixed',
        top: Math.max(pad, top) + 'px',
        left: Math.max(pad, left) + 'px'
      }
    },
    hideContextMenu() {
      this.contextMenuVisible = false
    },
    dueDatePreset(offsetDays) {
      return presetDueDate(offsetDays)
    },
    openDatePicker() {
      const input = this.$refs.dateInput
      if (!input) return
      // showPicker() opens the native calendar directly; fall back to focusing.
      if (typeof input.showPicker === 'function') {
        input.showPicker()
      } else {
        input.focus()
      }
    },
    setDueDateFromMenu(date) {
      this.$emit('set-due-date', date || null)
      this.hideContextMenu()
    }
  }
}
