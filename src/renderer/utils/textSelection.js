/**
 * Whether the document currently holds a non-empty text selection.
 *
 * A mouse-up that ends a drag-selection still fires a click on the element
 * under the pointer. Surfaces that open an editor on click use this to tell
 * that click from a plain one, so selecting text to copy it does not start an
 * edit. See docs/editing.md.
 *
 * @returns {boolean} True while some text is selected.
 */
export function hasTextSelection() {
  const selection = typeof window.getSelection === 'function' ? window.getSelection() : null
  return Boolean(selection && !selection.isCollapsed && selection.toString().length > 0)
}
