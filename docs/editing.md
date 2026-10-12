# Inline editing

Several surfaces edit in place rather than in a dialog: a click (or double-click) opens an editor, and leaving it ends the edit session.

| Surface | Opened by | Leaving the editor |
| --- | --- | --- |
| Card title (cards and kanban) | double-click the title | saves the title |
| Card notes (cards and kanban) | click the rendered notes | saves the notes, returns to the rendered view |
| Full-screen card title and notes | as on the card | as on the card; closing the overlay saves first (see [Full-screen card](fullscreen.md)) |
| Project notes pane | click the rendered notes, or the Edit button | saves the notes, returns to the rendered view |
| Sidebar "Add Project" / "Add Status" | click the button | discards the typed name |

## The title swallows single clicks

Clicking a card anywhere else collapses or expands it. The title does not: it consumes its own clicks and responds only to the double-click that opens the rename box.

Without that, the first click of a double-click reaches the card and toggles it. The card changes height, the resize observer re-runs the masonry layout, the grid reflows, and the title moves out from under the pointer before the second click lands, so the rename never opens. The wider a card is, the further its title travels, so this got worse when card width became a setting (see [Cards view](cards.md)).

The cost is that a single click on the title does nothing. Every other part of the card still expands and selects it.

## Losing application focus does not end the session

Switching to another application blurs whatever element has keyboard focus, and a blur is otherwise how these surfaces decide the user is done. Treating it as the end of the edit would close the editor behind the user's back: they return to a rendered note instead of the editor they left, and an unconfirmed sidebar name is gone.

Every blur handler above therefore ignores blurs raised while the application window itself is unfocused. `isWindowUnfocused()` in `src/renderer/utils/windowFocus.js` reads `document.hasFocus()` to tell the two cases apart: a click elsewhere inside the app keeps document focus, so it still ends the edit; the window losing focus does not. When the window is focused again, the surface puts keyboard focus back into its editor, so typing continues where it stopped.

Nothing is lost while the window is away: notes keep whatever the editor holds, and the debounced project-notes save is unaffected. Only the decision to close the editor is deferred.
