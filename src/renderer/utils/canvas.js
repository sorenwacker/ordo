/**
 * Whether a mouse-down landed on the empty canvas of a view.
 *
 * Cards handle their own clicks and controls have their own meaning, so only a
 * primary-button press on nothing in particular counts; a press on the scroll
 * container's own scrollbar is scrolling, not a click. See docs/selection.md.
 */

const CARD_OR_CONTROL = '.todo-card, .kanban-card, button, input, select, a'

/**
 * Args:
 *   event: The mouse-down event as received by the view's root handler.
 *
 * Returns:
 *   True when the press should clear the selection.
 */
export function isCanvasMouseDown(event) {
  if (event.button !== 0) return false
  const target = event.target
  if (target.closest(CARD_OR_CONTROL)) return false
  // A press past the client box of a scrolling element is on its scrollbar.
  // jsdom reports a zero client box, which disables this check in tests.
  if (target.clientWidth > 0 && target.clientHeight > 0) {
    const rect = target.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    if (x >= target.clientWidth || y >= target.clientHeight) return false
  }
  return true
}
