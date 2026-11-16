/**
 * The undo/redo action for a completion transition (Database.setCompleted or
 * Database.moveTodo). A completion may create the next occurrence of a
 * recurring todo; undoing the completion removes that occurrence again, and a
 * redo recreates it, so the stack never leaves a stray copy behind.
 */

/**
 * Build the history action for a transition that has just run.
 *
 * Args:
 *   database: The Database the transition ran on.
 *   oldTodo: The todo as it was before, from `getTodo`.
 *   result: What the transition returned: `{ todo, next }`.
 *   redo: Runs the same transition again and returns its `{ todo, next }`.
 *   description: Shown in the history UI.
 *
 * Returns:
 *   The action for `history.push`, or null when nothing changed.
 */
export function completionAction(database, oldTodo, result, redo, description) {
  if (!oldTodo || !result?.todo) return null
  if (JSON.stringify(oldTodo) === JSON.stringify(result.todo)) return null

  let spawnedId = result.next?.id ?? null
  return {
    type: 'todo-transition',
    description,
    undo: () => {
      database.updateTodo(oldTodo)
      if (spawnedId) database.permanentlyDeleteTodo(spawnedId)
    },
    redo: () => {
      spawnedId = redo().next?.id ?? null
    }
  }
}
