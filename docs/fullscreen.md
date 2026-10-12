# Full-screen card

Every card in the cards view and on the kanban board has a full-screen button in its header, next to the archive and delete buttons. It opens the card in an overlay that covers the application window, for reading or writing notes that do not fit a card.

## What the overlay shows

The overlay renders the same fields as the card: the title, the project name in the project colour, the due date, and the notes. The notes fill the remaining height and scroll on their own. A sensitive note shows the same placeholder as on the card and is never rendered.

The overlay is read from the live todo, so a change saved in it is visible on the card as soon as the overlay closes, and a card that disappears from the list, for instance because it was deleted from another window, closes its overlay.

## Editing

The title and the notes edit in place exactly as on a card (see [Inline editing](editing.md)): a double-click on the title opens the rename box, a click on the rendered notes opens the editor, and leaving either editor saves. The notes editor fills the overlay body. Edits go through the same `update-title` and `update-notes` path as the card's own edits, so undo, history, and the other windows see them the same way.

## Closing

The overlay closes on the close button, on a click on the backdrop outside the content, and on Escape. Closing saves an open editor first, so nothing typed is lost.

Escape is handled in two steps when an editor is open. The first Escape leaves the editor: a title edit is discarded, as on the card, and a notes edit is saved. The second Escape closes the overlay. While the overlay is open, Escape does not reach the application's global shortcut handler, which would otherwise also clear the list selection.

## Stacking

The overlay is a fixed element at the application root. The sticky main header and the sidebar carry their own `z-index` so they stay above scrolling content, and the sidebar toggle sits above both; an overlay below any of them is drawn with that element poking through. `.card-fullscreen` is therefore stacked above all of them, below only the database error banner, and `tests/CardFullscreen.test.js` reads the values back out of the stylesheets and fails if any of those elements rises above the overlay.

## Column width

The button is a third icon button in the kanban card header, which raised the fixed width a card header spends before its title gets any space. The kanban column floor was raised to match; the arithmetic is in [Kanban view](kanban.md).

## Gates

- `tests/CardFullscreen.test.js` covers the rendering, the editing hand-off, each way of closing, the two-step Escape, and that Escape does not propagate to other window listeners. It also checks that the application mounts the overlay and that both views forward the card's `open-fullscreen` event, since that wiring is what makes the button reachable.
- `tests/CardItem.test.js` and `tests/KanbanCard.test.js` check that the button emits `open-fullscreen` without selecting or toggling the card.
