# Kanban view

The kanban view has two layouts. Which one renders depends on the sidebar selection and the "Group by project" toggle.

## Status board (default)

Active when a single project is selected, or when "Group by project" is off. One board, one column per status, plus a leading "No Status" column for todos with no `status_id`.

Dragging a card between columns writes the target column's status to the card's `status_id`. The project is not touched.

## Grouped board

Active in "All" (no project selected) with "Group by project" on. One board per project section, stacked vertically, each with the same column set. An "Inbox" section holds todos with no `project_id`.

Dragging a card writes **both** fields from the drop target:

- `status_id` comes from the column the card was dropped into (`null` for "No Status").
- `project_id` comes from the project section that column belongs to (`null` for Inbox).

So a card can be moved to another status within its own section, or to another project's section, in a single drag. All sections share one drag group; there is no restriction on cross-section drops.

## Resolving the drop target

Both layouts read the destination from `event.to.dataset` on the SortableJS `end` event, never from the source list's own identity. SortableJS dispatches `end` on the sortable instance the drag *started* in, so a handler that closes over its own column's project and status would write the card's original position back and the card would appear not to move.

Each `draggable` list therefore carries the identity of its own drop zone as data attributes:

| Layout | Attributes on the list | Empty string means |
| --- | --- | --- |
| Status board | `data-status-id` | no status |
| Grouped board | `data-project-id`, `data-status-id` | inbox / no status |

`onKanbanDropStatus` and `onStackedKanbanDrop` in `src/renderer/mixins/todoActionsMixin.js` parse those attributes, persist the change with `window.api.updateTodo`, and reload so the derived column lists re-filter.

## Column width

A card's header is a flex row: checkbox, title, archive button, delete button. Everything except the title is fixed width and does not shrink, so a fixed amount of each column is spent before the title gets any space at all:

| Item | Width |
| --- | --- |
| Column padding (both sides) | 32px |
| Card padding (both sides) | 24px |
| Card left border | 3px |
| Checkbox | 16px |
| Archive and delete buttons | 44px |
| Three header gaps | 30px |
| Total | 149px |

The title therefore renders at `column width - 149px`. Below roughly a 200px column the title is narrower than a few characters, and because it also carries `word-break: break-word` it wraps once per character and the card grows to hundreds of pixels tall.

`.kanban-column` sets `min-width: 260px` to keep that from happening, which leaves the title at least 110px. The floor holds at every breakpoint down to 600px; the board scrolls horizontally instead of shrinking columns further, which is what `overflow-x: auto` on `.kanban-view` is for. Below 600px a column is `85vw` and the board is one column at a time.

There is no ceiling. Columns share the full board width, so a board with few columns, for instance with the Done column hidden, has no empty strip on the right. A `max-width` on `.kanban-column` at any breakpoint would bring that strip back; the layout test fails if one is declared.

`tests/kanbanLayout.test.js` gates the arithmetic: it reads the widths back out of the stylesheets and fails if the furniture grows or the floor drops far enough to squeeze the title.

## Card styling

A kanban card and a cards-view card render the same sub-elements from the same class names: `card-header`, `card-meta`, `card-project`, `card-deadline`, `card-dates-info`, `card-subtasks`, `card-notes-preview`. Each of those is styled by an unscoped base rule that both card types pick up, with `.todo-card`-scoped rules layered on top only where the cards view differs.

A rule written only in the `.todo-card` scope never reaches the board, and the class then renders with no styling at all rather than falling back to something close. `tests/kanbanLayout.test.js` reads the class names out of `KanbanCard.vue` and fails when a class the kanban card uses is styled exclusively inside that scope.

## The "Done" column

A status named `Done` (case-insensitive, surrounding whitespace ignored) is treated as the completion column. Nothing else marks it; there is no flag on the `statuses` row. If no status carries that name, none of the behaviour below applies and the checkbox and the columns stay independent.

When a Done column exists, the completion checkbox and the card's column are kept in sync in both directions:

- Ticking a card's checkbox sets `status_id` to the Done status, so the card moves into that column.
- Unticking a card that sits in the Done column clears `status_id`, so the card moves to "No Status". A card that is unticked while sitting in some other column keeps that column.
- Dropping a card into the Done column marks it completed.
- Dragging a card out of the Done column into any other column, including "No Status", marks it not completed.
- Dragging between two columns that are neither the Done column leaves the checkbox untouched.

Both directions run the same completion transition: completing a card with no due date sets `end_date` to today, and completing a recurring card creates its next occurrence. Un-completing does not clear `end_date`.

The "+ Add" button under the Done column is deliberately excluded: a card created there starts unticked, because creating an already-completed card is not a useful action and the card would be hidden immediately.

Completed items are hidden unless "Show done" is on, and so is the Done column itself: with "Show done" off, the board renders every status column except Done, in both layouts. A column that could only ever be empty would be wasted width. Ticking a card's checkbox therefore removes the card from the board; turning "Show done" on brings the column back with the completed cards in it. While the column is hidden, a card cannot be dragged into it, and the checkbox is the only way to complete a card from the board. `tests/kanbanDrop.test.js` gates this: the view receives the flag as `showCompleted` and the column set it renders is checked under both values.

The rules live in `src/renderer/utils/doneStatus.js` as pure functions. The writes happen in `toggleComplete` and `moveTodoTo` in `src/renderer/composables/useTodos.js`; both kanban drop handlers delegate to `moveTodoTo`.
