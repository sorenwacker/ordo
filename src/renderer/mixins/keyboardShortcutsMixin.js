/**
 * Global keyboard shortcuts for the app window: search, undo/redo, help, todo
 * navigation, and actions on the focused todo.
 *
 * The host component registers `handleKeyDown` as a window keydown listener
 * and must provide `navigableTodos` (the cards in rendered order, which
 * `focusedTodoIndex` indexes), `showGlobalSearch`,
 * `showHelpModal`, `selectTodo`, `toggleComplete`, `deleteTodo`, `undo`,
 * `redo`, and an `appHeader` ref exposing `focusNewTodoInput`.
 */
export default {
  methods: {
    handleKeyDown(e) {
      // Ignore if typing in input/textarea
      const target = e.target
      const isInputField =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      // Global Search: Cmd/Ctrl + K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        this.showGlobalSearch = true
        return
      }

      // Undo/Redo: Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z.
      // Skip when typing in a field so native text undo still works.
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z') && !isInputField) {
        e.preventDefault()
        if (e.shiftKey) {
          this.redo()
        } else {
          this.undo()
        }
        return
      }

      // Cmd+Arrow navigation
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'ArrowUp') {
          // Previous item in list
          e.preventDefault()
          const todoCount = this.navigableTodos.length
          if (todoCount > 0 && this.focusedTodoIndex > 0) {
            this.focusedTodoIndex--
            this.selectTodo(this.navigableTodos[this.focusedTodoIndex].id)
          }
          return
        }
        if (e.key === 'ArrowDown') {
          // Next item in list
          e.preventDefault()
          const todoCount = this.navigableTodos.length
          if (todoCount > 0 && this.focusedTodoIndex < todoCount - 1) {
            this.focusedTodoIndex++
            this.selectTodo(this.navigableTodos[this.focusedTodoIndex].id)
          }
          return
        }
      }

      // Escape closes everything: search, inline editing, fullscreen, detail panel, detached windows
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()

        if (this.showGlobalSearch) {
          this.showGlobalSearch = false
          return
        }
        this.focusedTodoIndex = -1
        return
      }

      // If global search is open, let it handle its own navigation
      if (this.showGlobalSearch) {
        return
      }

      // Don't process navigation shortcuts when in input field
      if (isInputField) return

      // Global shortcuts that work in any view
      switch (e.key) {
        case 'n': // New todo
          e.preventDefault()
          this.$refs.appHeader?.focusNewTodoInput()
          return
        case '/': // Open search
          e.preventDefault()
          this.showGlobalSearch = true
          return
        case '?': // Show help
          e.preventDefault()
          this.showHelpModal = true
          return
      }

      // Navigation shortcuts only work in list/table/cards view with todos
      const todoCount = this.navigableTodos.length
      if (todoCount === 0) return

      switch (e.key) {
        case 'j': // Move down
        case 'ArrowDown':
          e.preventDefault()
          this.focusedTodoIndex = Math.min(this.focusedTodoIndex + 1, todoCount - 1)
          if (this.focusedTodoIndex >= 0 && this.navigableTodos[this.focusedTodoIndex]) {
            this.selectTodo(this.navigableTodos[this.focusedTodoIndex].id)
          }
          break
        case 'k': // Move up
        case 'ArrowUp':
          e.preventDefault()
          if (this.focusedTodoIndex < 0) this.focusedTodoIndex = 0
          else this.focusedTodoIndex = Math.max(this.focusedTodoIndex - 1, 0)
          if (this.navigableTodos[this.focusedTodoIndex]) {
            this.selectTodo(this.navigableTodos[this.focusedTodoIndex].id)
          }
          break
        case 'x': // Toggle complete
        case ' ': // Space also toggles
          e.preventDefault()
          if (this.focusedTodoIndex >= 0 && this.navigableTodos[this.focusedTodoIndex]) {
            this.toggleComplete(this.navigableTodos[this.focusedTodoIndex])
          }
          break
        case 'e': // Edit (open detail)
        case 'Enter':
          e.preventDefault()
          if (this.focusedTodoIndex >= 0 && this.navigableTodos[this.focusedTodoIndex]) {
            this.selectTodo(this.navigableTodos[this.focusedTodoIndex].id)
          }
          break
        case 'Delete':
          e.preventDefault()
          if (this.focusedTodoIndex >= 0 && this.navigableTodos[this.focusedTodoIndex]) {
            this.deleteTodo(this.navigableTodos[this.focusedTodoIndex].id)
            // Adjust focus after deletion
            if (this.focusedTodoIndex >= this.navigableTodos.length) {
              this.focusedTodoIndex = this.navigableTodos.length - 1
            }
          }
          break
      }
    }
  }
}
