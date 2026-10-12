/**
 * Todos composable for managing todo items.
 * Provides reactive todo state that syncs with the database.
 */

import { reactive, computed, toRefs } from 'vue'
import { statusForCompletion, completionForStatus } from '../utils/doneStatus.js'

/**
 * Reactive todos state (private).
 */
const state = reactive({
  todos: [],
  allTodos: [],
  selectedTodoIds: new Set(),
  focusedTodoIndex: -1,
  _currentFilter: null,
  _searchQuery: '',
  _showCompleted: true,
  _sortBy: 'manual'
})

/**
 * Convert a todo object to plain data for API calls.
 * Strips out reactive wrappers and computed properties.
 * @param {Object} todo - The todo object to convert
 * @returns {Object} Plain todo object
 */
function toPlainTodo(todo) {
  return {
    id: todo.id,
    title: todo.title,
    notes: todo.notes,
    notes_sensitive: todo.notes_sensitive,
    end_date: todo.end_date,
    start_date: todo.start_date,
    completed: todo.completed,
    importance: todo.importance,
    project_id: todo.project_id,
    status_id: todo.status_id,
    sort_order: todo.sort_order,
    type: todo.type,
    parent_id: todo.parent_id,
    topic_id: todo.topic_id,
    recurrence_type: todo.recurrence_type,
    recurrence_interval: todo.recurrence_interval,
    recurrence_end_date: todo.recurrence_end_date,
    archived_at: todo.archived_at,
    deleted_at: todo.deleted_at
  }
}

/**
 * Sort a list of todos by the given criteria.
 *
 * 'manual' preserves the existing order (drag/sort_order). 'created' is newest
 * first, 'alpha' is by title, 'due' is by due date (end_date) ascending with
 * undated items last.
 *
 * @param {Array<Object>} list - The todos to sort (not mutated).
 * @param {string} sortBy - One of 'manual', 'created', 'alpha', 'due'.
 * @returns {Array<Object>} A new sorted array.
 */
export function sortTodos(list, sortBy) {
  const sorted = [...list]
  if (sortBy === 'created') {
    sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  } else if (sortBy === 'alpha') {
    sorted.sort((a, b) => a.title.localeCompare(b.title))
  } else if (sortBy === 'due') {
    sorted.sort((a, b) => {
      if (!a.end_date && !b.end_date) return 0
      if (!a.end_date) return 1
      if (!b.end_date) return -1
      return a.end_date.localeCompare(b.end_date)
    })
  }
  return sorted
}

/**
 * Load all todos from database.
 * Used for global operations and counts.
 */
async function loadAllTodos() {
  state.allTodos = await window.api.getTodos(null)
}

/**
 * Load todos for the current filter.
 * @param {number|string|null} filter - Project ID, 'inbox', 'trash', 'archive', or null for all
 */
async function loadTodos(filter) {
  state.todos = []
  state.todos = await window.api.getTodos(filter)
}

/**
 * Add a new todo.
 * @param {string} title - Todo title
 * @param {number|null} projectId - Project ID or null for inbox
 * @param {string} type - Todo type ('todo', 'note', 'milestone')
 * @param {Object} updates - Additional fields to set on creation
 */
async function addTodo(title, projectId = null, type = 'todo', updates = {}) {
  if (!title.trim()) return null

  const todo = await window.api.createTodo(title.trim(), projectId, type)

  if (todo && Object.keys(updates).length > 0) {
    const todoData = { ...todo, ...updates }
    await window.api.updateTodo(todoData)
  }

  await loadAllTodos()
  await loadTodos(state._currentFilter)
  return todo
}

/**
 * Delete a todo (move to trash).
 * @param {number} id - Todo ID
 */
async function deleteTodo(id) {
  await window.api.deleteTodo(id)
  await loadAllTodos()
  await loadTodos(state._currentFilter)
}

/**
 * Write a completion change into plain todo data.
 * Auto-sets end_date when completing if not already set. Un-completing leaves
 * end_date alone.
 * @param {Object} todoData - Plain todo data, mutated in place
 * @param {boolean} isCompleting - Whether the todo becomes completed
 */
function applyCompletion(todoData, isCompleting) {
  todoData.completed = isCompleting
  if (isCompleting && !todoData.end_date) {
    todoData.end_date = new Date().toISOString().split('T')[0]
  }
}

/**
 * Toggle todo completion status.
 * Auto-sets end_date when completing if not already set.
 * Creates next recurrence for recurring tasks.
 * Moves the todo into or out of the "Done" status column when one exists.
 * @param {Object} todo - The todo to toggle
 * @param {Array<Object>} statuses - Status rows, to locate the "Done" column
 */
async function toggleComplete(todo, statuses = []) {
  const todoData = toPlainTodo(todo)
  const isCompleting = !todo.completed
  applyCompletion(todoData, isCompleting)
  todoData.status_id = statusForCompletion(todoData.status_id, isCompleting, statuses)

  await window.api.updateTodo(todoData)

  // If completing a recurring task, create the next occurrence
  if (isCompleting && todo.recurrence_type) {
    await window.api.createNextRecurrence(todo.id)
  }

  await loadAllTodos()
  await loadTodos(state._currentFilter)
}

/**
 * Move a todo to another kanban cell.
 * Ticks the completion checkbox when the todo lands in the "Done" column and
 * unticks it when the todo leaves that column, running the same completion
 * transition as toggleComplete.
 * @param {Object} todo - The todo to move
 * @param {Object} target - Destination: `statusId`, and `projectId` when the
 *   move crosses project sections
 * @param {Array<Object>} statuses - Status rows, to locate the "Done" column
 */
async function moveTodoTo(todo, { statusId, projectId }, statuses = []) {
  const todoData = toPlainTodo(todo)
  const wasCompleted = Boolean(todo.completed)
  const isCompleting = completionForStatus(todo.status_id, statusId, wasCompleted, statuses)

  todoData.status_id = statusId
  if (projectId !== undefined) {
    todoData.project_id = projectId
  }
  if (isCompleting !== wasCompleted) {
    applyCompletion(todoData, isCompleting)
  }

  await window.api.updateTodo(todoData)

  if (isCompleting && !wasCompleted && todo.recurrence_type) {
    await window.api.createNextRecurrence(todo.id)
  }

  await loadAllTodos()
  await loadTodos(state._currentFilter)
}

/**
 * Archive a todo.
 * @param {number} id - Todo ID
 */
async function archiveTodo(id) {
  await window.api.archiveTodo(id)
  await loadAllTodos()
  await loadTodos(state._currentFilter)
}

/**
 * Unarchive a todo.
 * @param {number} id - Todo ID
 */
async function unarchiveTodo(id) {
  await window.api.unarchiveTodo(id)
  await loadAllTodos()
  await loadTodos(state._currentFilter)
}

/**
 * Restore a todo from trash.
 * @param {number} id - Todo ID
 */
async function restoreTodo(id) {
  await window.api.restoreTodo(id)
  await loadAllTodos()
  await loadTodos(state._currentFilter)
}

/**
 * Permanently delete a todo.
 * Cannot be undone.
 * @param {number} id - Todo ID
 */
async function permanentlyDeleteTodo(id) {
  await window.api.permanentlyDeleteTodo(id)
  await loadAllTodos()
  await loadTodos(state._currentFilter)
}

/**
 * Update todo title.
 * @param {Object} todo - The todo to update
 * @param {string} newTitle - New title
 */
async function handleUpdateTitle(todo, newTitle) {
  const todoData = toPlainTodo(todo)
  todoData.title = newTitle
  await window.api.updateTodo(todoData)
  await loadAllTodos()
  await loadTodos(state._currentFilter)
}

/**
 * Update todo notes.
 * @param {Object} todo - The todo to update
 * @param {string} newNotes - New notes content
 */
async function handleUpdateNotes(todo, newNotes) {
  const todoData = toPlainTodo(todo)
  todoData.notes = newNotes
  await window.api.updateTodo(todoData)
  await loadAllTodos()
  await loadTodos(state._currentFilter)
}

/**
 * Move todo to a different project.
 * @param {Object} todo - The todo to move
 * @param {number|null} projectId - Target project ID or null for inbox
 */
async function moveToProject(todo, projectId) {
  const todoData = toPlainTodo(todo)
  todoData.project_id = projectId
  await window.api.updateTodo(todoData)
  await loadAllTodos()
  await loadTodos(state._currentFilter)
}

/**
 * Set a todo's due date.
 * The due date is stored in the `end_date` field; pass null to clear it.
 * @param {Object} todo - The todo to update
 * @param {string|null} date - Due date as `YYYY-MM-DD`, or null to clear
 */
async function setDueDate(todo, date) {
  const todoData = toPlainTodo(todo)
  todoData.end_date = date || null
  await window.api.updateTodo(todoData)
  await loadAllTodos()
  await loadTodos(state._currentFilter)
}

/**
 * Set internal filter state for computed properties.
 * @param {number|string|null} filter - Filter value
 */
function setCurrentFilter(filter) {
  state._currentFilter = filter
}

/**
 * Set search query for filtering.
 * @param {string} query - Search query
 */
function setSearchQuery(query) {
  state._searchQuery = query
}

/**
 * Set whether to show completed todos.
 * @param {boolean} show - Show completed flag
 */
function setShowCompleted(show) {
  state._showCompleted = show
}

/**
 * Replace the multi-selection.
 * @param {Iterable<number>} ids - Ids of the todos to select
 */
function setSelectedTodoIds(ids) {
  state.selectedTodoIds = new Set(ids)
}

/**
 * Add a todo to the multi-selection, or remove it when already selected.
 * @param {number} id - Todo id
 */
function toggleSelectedTodoId(id) {
  const next = new Set(state.selectedTodoIds)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  state.selectedTodoIds = next
}

/**
 * Drop the multi-selection and the keyboard focus (see docs/selection.md).
 */
function clearSelection() {
  state.selectedTodoIds = new Set()
  state.focusedTodoIndex = -1
}

/**
 * Set sort criteria.
 * @param {string} sortBy - Sort criteria ('created', 'alpha', or 'manual')
 */
function setSortBy(sortBy) {
  state._sortBy = sortBy
}

/**
 * Todos composable hook.
 * @returns {Object} Todos state and methods
 */
export function useTodos() {
  // Computed properties
  const filteredTodos = computed(() => {
    let todos = state._currentFilter === null ? state.allTodos : state.todos

    // Apply search query filter
    if (state._searchQuery.trim()) {
      const query = state._searchQuery.toLowerCase().trim()
      todos = todos.filter(
        (t) =>
          (t.title && t.title.toLowerCase().includes(query)) ||
          (t.notes && t.notes.toLowerCase().includes(query))
      )
    }

    // Hide completed items if not showing them (but always show in archive/trash views)
    if (
      !state._showCompleted &&
      state._currentFilter !== 'archive' &&
      state._currentFilter !== 'trash'
    ) {
      todos = todos.filter((t) => !t.completed)
    }

    return todos
  })

  const sortedTodos = computed(() => sortTodos(filteredTodos.value, state._sortBy))

  const completedCount = computed(() => {
    const todos = state._currentFilter === null ? state.allTodos : state.todos
    return todos.filter((t) => t.completed).length
  })

  return {
    // Reactive refs
    ...toRefs(state),

    // Computed properties
    filteredTodos,
    sortedTodos,
    completedCount,

    // Methods
    loadTodos,
    loadAllTodos,
    addTodo,
    deleteTodo,
    toggleComplete,
    moveTodoTo,
    archiveTodo,
    unarchiveTodo,
    restoreTodo,
    permanentlyDeleteTodo,
    handleUpdateTitle,
    handleUpdateNotes,
    moveToProject,
    setDueDate,
    setCurrentFilter,
    setSearchQuery,
    setShowCompleted,
    setSortBy,
    setSelectedTodoIds,
    toggleSelectedTodoId,
    clearSelection,

    // Utilities
    toPlainTodo,
    sortTodos
  }
}

export default useTodos
