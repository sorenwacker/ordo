# Count badges

Each row in the sidebar carries a count badge on its right, and each project tile on the home overview carries one next to its name.

| Row | Badge |
| --- | --- |
| All | open todos across every project and the inbox |
| A project, in the sidebar or on an overview tile | open todos in that project |
| Archive, Trash | todos in that list |
| A status | todos with that status |

"Open" means not completed. A badge whose count is zero is not rendered, so a project with nothing left to do shows no badge rather than a `0`.

The badges used to read `done/total`, for instance `8/8` for a project whose eight todos were all completed. That number answered a question nobody was asking at the sidebar: the list is scanned for what still needs doing, and the done count was noise on every row that had any. The completed count is still available through the "Show done" toggle and the Done column on the board; see [Kanban view](kanban.md).

Both surfaces receive the counts as `{ done, total }` objects from the application and derive the open count through `openCount` in `src/renderer/utils/counts.js`, so the rule exists once. `tests/counts.test.js` covers the helper, and `tests/AppSidebar.test.js` and `tests/HomeLanding.test.js` check each surface: a project with open todos shows the open count only, a fully completed project shows no badge, and the All row follows the same rule.
