# Sidebar counts

Each row in the sidebar carries a count badge on its right.

| Row | Badge |
| --- | --- |
| All | open todos across every project and the inbox |
| A project | open todos in that project |
| Archive, Trash | todos in that list |
| A status | todos with that status |

"Open" means not completed. A badge whose count is zero is not rendered, so a project with nothing left to do shows no badge rather than a `0`.

The badges used to read `done/total`, for instance `8/8` for a project whose eight todos were all completed. That number answered a question nobody was asking at the sidebar: the list is scanned for what still needs doing, and the done count was noise on every row that had any. The completed count is still available through the "Show done" toggle and the Done column on the board; see [Kanban view](kanban.md).

`AppSidebar.vue` receives the counts as `{ done, total }` objects from the application and derives the open count itself in `openCount`. `tests/AppSidebar.test.js` checks the three cases: a project with open todos shows the open count only, a fully completed project shows no badge, and the All row follows the same rule.
