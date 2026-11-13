/**
 * Rules linking a todo's completion checkbox to a status column named "Done".
 *
 * The board has no flag marking a column as the completion column; the name is
 * the whole contract. When no status is named "Done", every function here is a
 * no-op and the checkbox and the columns stay independent.
 *
 * These are the pure rules. The writes that apply them live in one place,
 * `Database.setCompleted` and `Database.moveTodo` (src/main/database.js), which
 * the checkbox, the board and the MCP server all call; the renderer only uses
 * the rules to decide what to show (docs/kanban.md, "The Done column").
 */

const DONE_STATUS_NAME = 'done'

/**
 * Find the status that acts as the completion column.
 *
 * Args:
 *   statuses: The status rows, each with `id` and `name`.
 *
 * Returns:
 *   The status named "Done" (case-insensitive, trimmed), or null.
 */
export function findDoneStatus(statuses) {
  if (!Array.isArray(statuses)) return null
  return (
    statuses.find(
      (status) =>
        typeof status?.name === 'string' && status.name.trim().toLowerCase() === DONE_STATUS_NAME
    ) || null
  )
}

/**
 * Status a todo should carry after its checkbox was toggled.
 *
 * Completing moves the todo into the Done column. Un-completing moves it out to
 * "No Status", but only when it was sitting in the Done column; a todo
 * un-completed from any other column keeps that column.
 *
 * Args:
 *   currentStatusId: The todo's status id, null for "No Status".
 *   isCompleting: True when the toggle completes the todo.
 *   statuses: The status rows.
 *
 * Returns:
 *   The status id to write, null for "No Status".
 */
export function statusForCompletion(currentStatusId, isCompleting, statuses) {
  const done = findDoneStatus(statuses)
  if (!done) return currentStatusId
  if (isCompleting) return done.id
  return currentStatusId === done.id ? null : currentStatusId
}

/**
 * Completion a todo should carry after it moved between columns.
 *
 * Args:
 *   fromStatusId: The status id the todo is leaving, null for "No Status".
 *   toStatusId: The status id it is moving to, null for "No Status".
 *   wasCompleted: The todo's completion before the move.
 *   statuses: The status rows.
 *
 * Returns:
 *   True when the todo should be completed after the move.
 */
export function completionForStatus(fromStatusId, toStatusId, wasCompleted, statuses) {
  const done = findDoneStatus(statuses)
  if (!done) return Boolean(wasCompleted)
  if (toStatusId === done.id) return true
  if (fromStatusId === done.id) return false
  return Boolean(wasCompleted)
}
