import { MAX_LENGTH } from '../src/config/constants.js'
import { formatLocalDate } from '../src/renderer/utils/dueDates.js'

const TODO_TYPES = ['todo', 'note', 'milestone']

/**
 * Reduce a todo row to the fields useful over MCP.
 *
 * @param {Object} todo - Row from Database queries (with joined names).
 * @returns {Object} Trimmed representation.
 */
function trimTodo(todo) {
  return {
    id: todo.id,
    title: todo.title,
    notes: todo.notes || '',
    completed: Boolean(todo.completed),
    project: todo.project_name ?? null,
    status: todo.status_name ?? null,
    start_date: todo.start_date ?? null,
    end_date: todo.end_date ?? null,
    importance: todo.importance ?? null,
    type: todo.type,
    created_at: todo.created_at
  }
}

/**
 * Build the MCP tool set over a Database instance.
 *
 * Each tool is {name, description, inputSchema, handler}; handlers return
 * plain objects and throw Error on invalid input, so they are testable
 * without any MCP transport.
 *
 * @param {Object} db - Database instance (src/main/database.js).
 * @returns {Array<Object>} Tool definitions.
 */
export function createTools(db) {
  const resolveProject = (ref) => {
    const projects = db.getAllProjects()
    const project =
      typeof ref === 'number'
        ? projects.find((p) => p.id === ref)
        : projects.find((p) => p.name.toLowerCase() === String(ref).toLowerCase())
    if (!project) {
      throw new Error(`Unknown project: ${ref}`)
    }
    return project
  }

  const resolveStatus = (name) => {
    const status = db
      .getAllStatuses()
      .find((s) => s.name.toLowerCase() === String(name).toLowerCase())
    if (!status) {
      const known = db
        .getAllStatuses()
        .map((s) => s.name)
        .join(', ')
      throw new Error(`Unknown status: ${name}. Known statuses: ${known}`)
    }
    return status
  }

  const getExistingTodo = (id) => {
    const todo = db.getTodo(id)
    if (!todo || todo.deleted_at) {
      throw new Error(`No todo with id ${id}`)
    }
    return todo
  }

  const validateTitle = (title) => {
    const trimmed = typeof title === 'string' ? title.trim() : ''
    if (!trimmed) {
      throw new Error('title is required')
    }
    if (trimmed.length > MAX_LENGTH.TODO_TITLE) {
      throw new Error(`title exceeds maximum length of ${MAX_LENGTH.TODO_TITLE}`)
    }
    return trimmed
  }

  const validateImportance = (importance) => {
    if (importance == null) return null
    if (!Number.isInteger(importance) || importance < 1 || importance > 5) {
      throw new Error('importance must be an integer between 1 and 5')
    }
    return importance
  }

  return [
    {
      name: 'list_projects',
      description: 'List active projects in the todo app.',
      inputSchema: { type: 'object', properties: {} },
      handler: () => db.getAllProjects().map((p) => ({ id: p.id, name: p.name, color: p.color }))
    },
    {
      name: 'list_todos',
      description:
        'List todos. Optional filters: project (name or id), status (name), include_completed (default false). Excludes trashed and archived todos.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: ['string', 'number'], description: 'Project name or id' },
          status: { type: 'string', description: 'Status name, e.g. "Todo"' },
          include_completed: { type: 'boolean', default: false }
        }
      },
      handler: ({ project, status, include_completed = false } = {}) => {
        const projectId = project === undefined ? null : resolveProject(project).id
        let todos = db.getAllTodos(projectId)
        if (status !== undefined) {
          const statusId = resolveStatus(status).id
          todos = todos.filter((t) => t.status_id === statusId)
        }
        if (!include_completed) {
          todos = todos.filter((t) => !t.completed)
        }
        return todos.map(trimTodo)
      }
    },
    {
      name: 'add_todo',
      description:
        'Create a todo. Required: title. Optional: project (name or id), notes, start_date (YYYY-MM-DD, defaults to today), end_date, importance (1-5), status (name), type (todo/note/milestone).',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          project: { type: ['string', 'number'] },
          notes: { type: 'string' },
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          importance: { type: 'integer', minimum: 1, maximum: 5 },
          status: { type: 'string' },
          type: { type: 'string', enum: TODO_TYPES }
        },
        required: ['title']
      },
      handler: ({ title, project, notes, start_date, end_date, importance, status, type } = {}) => {
        const cleanTitle = validateTitle(title)
        const projectId = project === undefined ? null : resolveProject(project).id
        const statusId = status === undefined ? null : resolveStatus(status).id
        if (type !== undefined && !TODO_TYPES.includes(type)) {
          throw new Error(`type must be one of: ${TODO_TYPES.join(', ')}`)
        }
        // Validate before writing, so invalid input leaves no partial todo,
        // and create + update in one transaction.
        const cleanImportance = validateImportance(importance)
        const updated = db.db.transaction(() => {
          const created = db.createTodo(cleanTitle, projectId, type || 'todo')
          return db.updateTodo({
            ...created,
            notes: notes ?? created.notes ?? '',
            start_date: start_date ?? formatLocalDate(new Date()),
            end_date: end_date ?? null,
            importance: cleanImportance,
            status_id: statusId
          })
        })()
        return trimTodo(db.getAllTodos().find((t) => t.id === updated.id) ?? updated)
      }
    },
    {
      name: 'update_todo',
      description:
        'Update fields of a todo by id. Updatable: title, notes, start_date, end_date, importance (1-5), status (name), project (name or id).',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          title: { type: 'string' },
          notes: { type: 'string' },
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          importance: { type: 'integer', minimum: 1, maximum: 5 },
          status: { type: 'string' },
          project: { type: ['string', 'number'] }
        },
        required: ['id']
      },
      handler: ({ id, title, notes, start_date, end_date, importance, status, project } = {}) => {
        const existing = getExistingTodo(id)
        const updates = { ...existing }
        if (title !== undefined) updates.title = validateTitle(title)
        if (notes !== undefined) updates.notes = notes
        if (start_date !== undefined) updates.start_date = start_date
        if (end_date !== undefined) updates.end_date = end_date
        if (importance !== undefined) updates.importance = validateImportance(importance)
        if (status !== undefined) updates.status_id = resolveStatus(status).id
        if (project !== undefined) updates.project_id = resolveProject(project).id
        db.updateTodo(updates)
        return trimTodo(db.getAllTodos().find((t) => t.id === id) ?? db.getTodo(id))
      }
    },
    {
      name: 'complete_todo',
      description: 'Set the completed state of a todo by id. completed defaults to true.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          completed: { type: 'boolean', default: true }
        },
        required: ['id']
      },
      handler: ({ id, completed = true } = {}) => {
        getExistingTodo(id)
        // The one completion transition, shared with the app's checkbox and
        // board: due date, Done column and next occurrence, in one transaction
        return trimTodo(db.setCompleted(id, Boolean(completed)).todo)
      }
    },
    {
      name: 'search_todos',
      description: 'Full-text search over todo titles, notes, project names, and tags.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'integer', default: 20 }
        },
        required: ['query']
      },
      handler: ({ query, limit = 20 } = {}) => {
        if (typeof query !== 'string' || !query.trim()) {
          throw new Error('query is required')
        }
        const results = db.globalSearch(query.trim(), limit)
        return {
          todos: results.todos.map(trimTodo),
          projects: results.projects.map((p) => ({ id: p.id, name: p.name })),
          tags: results.tags.map((t) => t.name)
        }
      }
    }
  ]
}
