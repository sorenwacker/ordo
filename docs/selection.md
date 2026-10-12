# Selecting cards

Two kinds of selection exist on the cards view and the kanban board, and both are cleared by a click on the empty canvas.

## Keyboard focus

A single click on a card gives it keyboard focus: the `j`/`k` navigation and the single-card shortcuts act on it. The cards view marks the focused card with an outline; the kanban board does not mark it. Escape drops keyboard focus.

## Multi-selection

Cmd-click (Ctrl-click on Windows and Linux) toggles a card in the multi-selection, which is drawn as a glow around each selected card. In the cards view, dragging on empty space draws a marquee and selects every card it touches; a drag shorter than 10px in both directions is treated as a click and selects nothing. Dragging a selected card drags the whole selection.

## Clearing

A mouse-down on the canvas, that is anywhere in the view that is not a card, a button, an input, a select or a link, clears both the multi-selection and keyboard focus. This holds in both views, and on the kanban board it includes column headers and the empty space inside a column. In the cards view the same mouse-down may go on to draw a marquee; the marquee's selection then replaces the cleared one.

`CardsView` and `KanbanView` emit `clear-selection` from their mouse-down handlers, and `clearSelection` in `src/renderer/mixins/todoActionsMixin.js` resets both pieces of state. `tests/CardsView.test.js` and `tests/kanbanDrop.test.js` check that the canvas emits and a card does not, that the action clears both, and that the application listens on both views.
