/**
 * The cards in the order the active view renders them, which is the order
 * keyboard navigation walks and the list the focus index points into.
 *
 * A grouped view renders group by group; otherwise the sorted, filtered list is
 * the order on screen. Hidden cards are in neither, so they are never visited.
 *
 * @param {Object} lists
 * @param {boolean} lists.groupByProject - Whether the view groups cards by project.
 * @param {Array<{todos: Array<Object>}>} lists.groupedTodos - The rendered groups.
 * @param {Array<Object>} lists.sortedTodos - The rendered flat list.
 * @returns {Array<Object>} The rendered cards in order.
 */
export function navigationOrder({ groupByProject, groupedTodos, sortedTodos }) {
  if (groupByProject) return groupedTodos.flatMap((group) => group.todos)
  return sortedTodos
}
