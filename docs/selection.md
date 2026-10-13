# Selecting cards

Two kinds of selection exist on the cards view and the kanban board, and both are cleared by a click on the empty canvas or by Escape.

## Keyboard focus

A single click on a card gives it keyboard focus: the `j`/`k` navigation and the single-card shortcuts act on it. The cards view marks the focused card with an outline; the kanban board does not mark it.

`j`, `k`, the arrow keys and Cmd-arrows move the focus through the cards in the order they are rendered: the current sort, and group by group when cards are grouped by project. A card that is not rendered is not visited, so a done card hidden while "Show done" is off, or a card outside the search filter, costs no keypress and never takes the focus. `x`, Space, Enter and Delete act on the same rendered list, and a click or a global-search hit focuses a card by its place in it. The focus is kept as an index into that list, so when the card under it leaves the list, for instance by being ticked done while done cards are hidden, the focus stays in place and lands on the card that moves up into it.

The rendered order is computed once, by `navigationOrder` in `src/renderer/utils/navigation.js`, and exposed to the keyboard mixin as `navigableTodos`; the mixin reads no other list. On the kanban board the order follows the sort, not the columns, which is acceptable because the board does not mark the focus.

## Multi-selection

Cmd-click (Ctrl-click on Windows and Linux) toggles a card in the multi-selection, which is drawn as a glow around each selected card. In the cards view, dragging on empty space draws a marquee and selects every card it touches; a drag shorter than 10px in both directions is treated as a click and selects nothing. Dragging a selected card drags the whole selection.

## Clearing

Escape, outside global search, clears both the multi-selection and keyboard focus, as the help modal states. Global search takes the first Escape to close itself, and an open full-screen card keeps Escape to itself, see [Full-screen card](fullscreen.md).

A primary-button mouse-down on the canvas, that is anywhere in the view that is not a card, a button, an input, a select or a link, clears both the multi-selection and keyboard focus. This holds in both views, and on the kanban board it includes column headers and the empty space inside a column. A press on a scrollbar is scrolling, not a click, and a right-button press opens nothing and clears nothing. In the cards view the same mouse-down may go on to draw a marquee; the marquee's selection then replaces the cleared one.

The rule for what counts as canvas lives once, in `isCanvasMouseDown` in `src/renderer/utils/canvas.js`, and both views call it before emitting `clear-selection`. The selection state belongs to the todos composable, and every write to it goes through that composable: `setSelectedTodoIds` for the marquee, `toggleSelectedTodoId` for Cmd-click, and `clearSelection` for a plain click, the canvas and Escape. The application exposes the state to the views through a read-only computed, so a write anywhere else is silently dropped by Vue, which is how the marquee selection was lost before this rule existed.

`tests/keyboardNavigation.test.js` covers the rendered order, that a hidden card costs no keypress, and that the application and the mixin read only the rendered list. `tests/selection.test.js` covers the canvas rule, the Escape key and the composable writes, and fails if the application assigns to the selection directly. `tests/CardsView.test.js` and `tests/kanbanDrop.test.js` check that the canvas emits and a card does not, and that the application listens on both views.
