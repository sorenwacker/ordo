import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // External links
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Project operations
  getProjects: () => ipcRenderer.invoke('get-projects'),
  createProject: (name, color) => ipcRenderer.invoke('create-project', name, color),
  updateProject: (project) => ipcRenderer.invoke('update-project', project),
  updateProjectNotes: (id, notes) => ipcRenderer.invoke('update-project-notes', id, notes),
  deleteProject: (id) => ipcRenderer.invoke('delete-project', id),
  restoreProject: (id) => ipcRenderer.invoke('restore-project', id),
  permanentlyDeleteProject: (id) => ipcRenderer.invoke('permanently-delete-project', id),
  getDeletedProjects: () => ipcRenderer.invoke('get-deleted-projects'),

  // Status operations
  getStatuses: () => ipcRenderer.invoke('get-statuses'),
  createStatus: (name, color) => ipcRenderer.invoke('create-status', name, color),
  updateStatus: (status) => ipcRenderer.invoke('update-status', status),
  deleteStatus: (id) => ipcRenderer.invoke('delete-status', id),

  // Todo operations
  getTodos: (projectId) => ipcRenderer.invoke('get-todos', projectId),
  createTodo: (title, projectId, type = 'todo') =>
    ipcRenderer.invoke('create-todo', title, projectId, type),
  updateTodo: (todo, options) => ipcRenderer.invoke('update-todo', todo, options),
  setTodoCompleted: (id, completed) => ipcRenderer.invoke('set-todo-completed', id, completed),
  moveTodo: (id, target) => ipcRenderer.invoke('move-todo', id, target),
  deleteTodo: (id) => ipcRenderer.invoke('delete-todo', id),
  restoreTodo: (id) => ipcRenderer.invoke('restore-todo', id),
  permanentlyDeleteTodo: (id) => ipcRenderer.invoke('permanently-delete-todo', id),
  emptyTrash: () => ipcRenderer.invoke('empty-trash'),
  getTrashCount: () => ipcRenderer.invoke('get-trash-count'),
  archiveTodo: (id) => ipcRenderer.invoke('archive-todo', id),
  archiveCompletedTodos: (projectId) => ipcRenderer.invoke('archive-completed-todos', projectId),
  unarchiveTodo: (id) => ipcRenderer.invoke('unarchive-todo', id),
  getArchiveCount: () => ipcRenderer.invoke('get-archive-count'),

  // Tag operations
  getAllTags: () => ipcRenderer.invoke('get-all-tags'),
  getTodoTags: (todoId) => ipcRenderer.invoke('get-todo-tags', todoId),
  addTodoTag: (todoId, tagName) => ipcRenderer.invoke('add-todo-tag', todoId, tagName),
  removeTodoTag: (todoId, tagId) => ipcRenderer.invoke('remove-todo-tag', todoId, tagId),
  getProjectTags: (projectId) => ipcRenderer.invoke('get-project-tags', projectId),
  addProjectTag: (projectId, tagName) => ipcRenderer.invoke('add-project-tag', projectId, tagName),
  removeProjectTag: (projectId, tagId) =>
    ipcRenderer.invoke('remove-project-tag', projectId, tagId),

  reorderTodos: (ids) => ipcRenderer.invoke('reorder-todos', ids),
  reorderProjects: (ids) => ipcRenderer.invoke('reorder-projects', ids),
  reorderStatuses: (ids) => ipcRenderer.invoke('reorder-statuses', ids),

  // Link operations
  getLinkedTodos: (todoId) => ipcRenderer.invoke('get-linked-todos', todoId),
  linkTodos: (sourceId, targetId) => ipcRenderer.invoke('link-todos', sourceId, targetId),
  unlinkTodos: (sourceId, targetId) => ipcRenderer.invoke('unlink-todos', sourceId, targetId),
  searchTodos: (query, excludeId) => ipcRenderer.invoke('search-todos', query, excludeId),

  // Global search
  globalSearch: (query) => ipcRenderer.invoke('global-search', query),

  // Recurrence operations

  // Export/Import operations
  exportData: () => ipcRenderer.invoke('export-data'),
  importData: (mode) => ipcRenderer.invoke('import-data', mode),
  getDatabasePath: () => ipcRenderer.invoke('get-database-path'),
  resetDatabase: () => ipcRenderer.invoke('reset-database'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Events
  onRefreshTodos: (callback) => {
    ipcRenderer.on('refresh-todos', callback)
    return () => ipcRenderer.removeListener('refresh-todos', callback)
  },

  // Undo/Redo operations
  undo: () => ipcRenderer.invoke('undo'),
  redo: () => ipcRenderer.invoke('redo'),
  getHistoryState: () => ipcRenderer.invoke('get-history-state'),
  onHistoryChanged: (callback) => {
    const handler = (_, state) => callback(state)
    ipcRenderer.on('history-changed', handler)
    return () => ipcRenderer.removeListener('history-changed', handler)
  },

  // Auto-update progress pushed by src/main/updater.js
  onUpdaterStatus: (callback) => {
    const handler = (_, status) => callback(status)
    ipcRenderer.on('updater-status', handler)
    return () => ipcRenderer.removeListener('updater-status', handler)
  }
})
