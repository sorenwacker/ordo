/**
 * Number of todos still open in a `{ done, total }` count.
 *
 * The sidebar rows and the project overview tiles both badge what still needs
 * doing (see docs/sidebar.md), so the rule lives here rather than in each.
 *
 * @param {{ done: number, total: number } | undefined} count - Completed and
 *   total todos, or undefined for a project with no todos yet.
 * @returns {number} Todos not yet completed.
 */
export function openCount(count) {
  if (!count) return 0
  return count.total - count.done
}
