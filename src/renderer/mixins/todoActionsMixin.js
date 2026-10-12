/**
 * App-level todo actions: creation, completion, editing, archiving, trash,
 * drag-and-drop persistence, manual ordering, and clearing the selection.
 *
 * The host component must provide `todosComposable` and `projectsComposable`
 * (from setup), the `loadAllTodos`/`loadTodos` methods, `selectTodo`, and the
 * `currentFilter`, `isProjectSelected`, `allTodos`, `statuses`, `newTodoTitle`,
 * and `trashCount` state.
 */

/**
 * Reads a project or status id off a kanban drop zone's data attribute.
 *
 * Args:
 *   value: The raw `dataset` value, empty for the Inbox section and the
 *     No Status column, and absent when the drop target is not a drop zone.
 *
 * Returns:
 *   The numeric id, or null when the zone stands for "none".
 */
function parseDropZoneId(value) {
  if (value === undefined || value === null || value === '') return null
  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) ? null : parsed
}

export default {
  methods: {
    // The views emit `clear-selection` on a canvas click (see docs/selection.md).
    clearSelection() {
      this.todosComposable.clearSelection()
    },
    updateStatusTodos(_statusId, _todos) {
      // Used by draggable for reactive updates
    },
    async persistManualOrder(orderedTodos) {
      // vuedraggable delivers the new visual order via update:model-value.
      // Persist it as sort_order, then reload so the derived (computed) lists
      // re-derive in the new order.
      await window.api.reorderTodos(orderedTodos.map((t) => t.id))
      await this.loadAllTodos()
      await this.loadTodos()
    },
    updateSortedTodos(todos) {
      this.persistManualOrder(todos)
    },
    updateGroupTodos(_groupId, todos) {
      this.persistManualOrder(todos)
    },
    async onKanbanDropStatus(event) {
      const todoId = event.item?.__draggable_context?.element?.id
      if (!todoId) return

      // Get target status from the drop target element
      const parsedStatusId = parseDropZoneId(event.to?.dataset?.statusId)

      const todo = this.allTodos.find((t) => t.id === todoId)
      if (todo && todo.status_id !== parsedStatusId) {
        await this.todosComposable.moveTodoTo(todo, { statusId: parsedStatusId }, this.statuses)
      }
    },
    async onStackedKanbanDrop(event) {
      const todoId = event.item?.__draggable_context?.element?.id
      if (!todoId) return

      // Read the destination from the drop target, not from the source list:
      // SortableJS fires `end` on the list the drag started in, so the source
      // column's own project and status would just restore the original state.
      const projectId = parseDropZoneId(event.to?.dataset?.projectId)
      const statusId = parseDropZoneId(event.to?.dataset?.statusId)

      const todo = this.allTodos.find((t) => t.id === todoId)
      if (todo) {
        await this.todosComposable.moveTodoTo(todo, { statusId, projectId }, this.statuses)
      }
    },
    async addTodo() {
      if (!this.newTodoTitle.trim()) return
      const projectId =
        this.currentFilter !== null && this.currentFilter !== 'inbox' ? this.currentFilter : null
      const type = 'todo'
      const updates = { start_date: new Date().toISOString().split('T')[0] }
      try {
        await this.todosComposable.addTodo(this.newTodoTitle.trim(), projectId, type, updates)
      } catch (error) {
        this.showDbError('Failed to add todo: ' + error.message)
        return
      }
      this.newTodoTitle = ''
      this.projectsComposable.setAllTodos(this.allTodos)
    },
    async addTodoToProject(projectId) {
      try {
        const type = 'todo'
        const todo = await window.api.createTodo('Untitled', projectId, type)
        await this.loadAllTodos()
        await this.loadTodos()
        if (todo) this.selectTodo(todo.id)
      } catch (error) {
        this.showDbError('Failed to add todo: ' + error.message)
      }
    },
    async addTodoToStatus(statusId) {
      try {
        const projectId = this.isProjectSelected ? this.currentFilter : null
        const type = 'todo'
        const todo = await window.api.createTodo('Untitled', projectId, type)
        if (statusId !== null) {
          const todoData = this.toPlainTodo(todo)
          todoData.status_id = statusId
          await window.api.updateTodo(todoData)
        }
        await this.loadAllTodos()
        await this.loadTodos()
        if (todo) this.selectTodo(todo.id)
      } catch (error) {
        this.showDbError('Failed to add todo: ' + error.message)
      }
    },
    async moveInboxTodoToProject(todo, projectId) {
      todo.project_id = projectId
      const todoData = this.toPlainTodo(todo)
      await window.api.updateTodo(todoData)
      await this.loadAllTodos()
      await this.loadTodos()
    },
    async toggleComplete(todo) {
      await this.todosComposable.toggleComplete(todo, this.statuses)
      // Sync to project composable for counts
      this.projectsComposable.setAllTodos(this.allTodos)
    },
    async handleUpdateTitle(todo, newTitle) {
      await this.todosComposable.handleUpdateTitle(todo, newTitle)
      this.projectsComposable.setAllTodos(this.allTodos)
    },
    async handleUpdateNotes(todo, newNotes) {
      await this.todosComposable.handleUpdateNotes(todo, newNotes)
      this.projectsComposable.setAllTodos(this.allTodos)
    },
    async deleteTodo(id) {
      await this.todosComposable.deleteTodo(id)
      this.projectsComposable.setAllTodos(this.allTodos)
    },
    async archiveTodo(id) {
      await this.todosComposable.archiveTodo(id)
      this.projectsComposable.setAllTodos(this.allTodos)
    },
    async archiveCompletedTodos() {
      const projectId = this.isProjectSelected
        ? this.currentFilter
        : this.currentFilter === 'inbox'
          ? 'inbox'
          : null
      const count = await window.api.archiveCompletedTodos(projectId)
      if (count > 0) {
        await this.loadAllTodos()
        await this.loadTodos()
      }
    },
    async unarchiveTodo(id) {
      await this.todosComposable.unarchiveTodo(id)
      this.projectsComposable.setAllTodos(this.allTodos)
    },
    async moveToProject(todo, projectId) {
      await this.todosComposable.moveToProject(todo, projectId)
      this.projectsComposable.setAllTodos(this.allTodos)
    },
    async setDueDate(todo, date) {
      await this.todosComposable.setDueDate(todo, date)
      this.projectsComposable.setAllTodos(this.allTodos)
    },
    async restoreTodo(id) {
      await this.todosComposable.restoreTodo(id)
      this.projectsComposable.setAllTodos(this.allTodos)
    },
    async permanentlyDeleteTodo(id) {
      await this.todosComposable.permanentlyDeleteTodo(id)
      this.projectsComposable.setAllTodos(this.allTodos)
    },
    async emptyTrash() {
      if (confirm('Are you sure you want to permanently delete all items in trash?')) {
        await window.api.emptyTrash()
        await this.loadAllTodos()
        await this.loadTodos()
        // Force refresh the trash count
        this.trashCount = 0
      }
    },
    toPlainTodo(todo) {
      return this.todosComposable.toPlainTodo(todo)
    }
  }
}
