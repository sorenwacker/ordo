# Codebase review: ordo

Reviewed 2026-11-06 by an automated multi-agent pass. Each high and medium finding was checked by a second agent that tried to refute it against the code. Low findings were not verified.

## Baseline gates

| Gate | Result |
|---|---|
| Lint (eslint) | pass, 5 v-html warnings |
| Unit tests (vitest) | 425/425 pass |
| Build (electron-vite) | pass |
| npm audit | 9 moderate left; fixes need major bumps |

## Summary

Confirmed: 25 (high 1, medium 12, low 12). Unverified low-confidence notes: 47. Refuted: 2.

## High

### repairStaleCategoryFk's DROP TABLE todos would wipe links and tags once foreign keys are enabled

`src/main/schema.js:268` - correctness

The rebuild runs `DROP TABLE todos` inside a transaction. SQLite's documented 12-step table rebuild requires turning foreign_keys OFF first, because with enforcement on, DROP TABLE does an implicit DELETE that fires ON DELETE CASCADE on todo_links, todo_tags and milestone_todos and SET NULL on parent_id. It is harmless today only because foreign_keys is never enabled. Fixing that bug (see the database.js finding) would turn this migration into silent data loss. The test at tests/schemaCompatibility.test.js:171 turns foreign_keys on only after opening.

**Fix:** Run `PRAGMA foreign_keys = OFF` before the transaction (the pragma has no effect inside one), run `PRAGMA foreign_key_check` after the rename, and restore the previous setting afterwards.

## Medium

### createNextRecurrence lands one day early when the interval crosses a DST change

`src/main/database.js:367` - correctness

`new Date(todo.end_date)` parses 'YYYY-MM-DD' as UTC midnight. setDate/setMonth/setFullYear then do the arithmetic in local time, and `toISOString().split('T')[0]` converts back to UTC. When the interval crosses a DST change, the result moves by an hour and drops to the previous UTC day. Checked with TZ=Europe/Berlin: a weekly todo due 2026-03-25 comes out as 2026-03-31 instead of 2026-04-01. Negative-offset zones get the same problem at their spring-forward change. nextStartDate (lines 398-404) has the same flaw. Monthly recurrence from the 31st also overflows: Jan 31 + 1 month gives Mar 3.

**Fix:** Do the arithmetic only in UTC (setUTCDate/setUTCMonth/setUTCFullYear on the Date parsed from YYYY-MM-DD), or use plain y/m/d integers. Clamp the day of month for monthly and yearly steps.

### Soft-deleting a project permanently detaches its todos; restoreProject does not bring them back

**Status:** fixed (schema version 2 adds `todos.deleted_project_id`).

`src/main/database.js:145` - correctness

deleteProject runs `UPDATE todos SET project_id = NULL WHERE project_id = ?` before setting deleted_at. The trash bin offers restoreProject, but that only clears deleted_at, so a restored project comes back empty and its todos stay in the inbox. The todos' topic_id values still point at the project's topics. The two UPDATEs also don't run in a transaction.

**Fix:** Keep project_id on soft delete and filter deleted projects in the queries instead. Or record the detached todo ids (for example in a deleted_project_id column) so restoreProject can reattach them. Wrap the statements in db.transaction.

### Navigation guard lets any file: URL load with the preload API attached

`src/main/index.js:162` - correctness

In production the will-navigate allowlist is `url.startsWith('file:')`. That accepts every local file, not only the app's renderer/index.html. If a user drops an .html file onto the window, Chromium navigates to file:///path/evil.html. The same happens when someone clicks an unintercepted file:// link in rendered markdown. Either way, the foreign page runs with window.api exposed (openExternal, resetDatabase, permanentlyDelete*, importData...). This is exactly what the comment says can never happen: "so no foreign page can ever run with the preload API attached".

**Fix:** Compare against the exact renderer URL, e.g. `pathToFileURL(join(__dirname, '../renderer/index.html')).href` (optionally ignoring hash/query). Also block will-navigate for drag-drop by default.

### add_todo creates the row before validating importance, leaving orphan todos on invalid input

`mcp-server/tools.js:148` - correctness

`const created = db.createTodo(...)` runs first. `validateImportance(importance)` is evaluated afterwards, inside the object literal passed to `db.updateTodo`. When importance is invalid (e.g. 7 or 2.5) the handler throws and the MCP client gets an error, but a bare todo with that title has already been committed. A retry then creates a duplicate. The same applies to any other failure inside updateTodo, e.g. a non-string start_date reaching `.trim()`. There is no transaction around the two calls.

**Fix:** Validate everything (importance, type, dates as strings) before calling createTodo. Or wrap create+update in a db transaction.

### Merge import duplicates statuses (kanban columns)

`src/main/importExport.js:103` - correctness

Tags are de-duplicated by name (INSERT OR IGNORE + SELECT), but statuses are always inserted as new rows. statuses.name has no UNIQUE constraint. Every database is seeded with Todo/In Progress/Done/Backlog (database.js:88-100). So a merge import of any export (including one from the same app) doubles every status column, and the imported todos point at the new duplicates. Projects are duplicated the same way.

**Fix:** On merge, map statuses (and, if intended, projects) by name to existing rows, the same way tags are mapped. Only insert when no row with that name exists.

### complete_todo skips the recurrence and Done-status logic the app applies on completion

`mcp-server/tools.js:203` - consistency

The renderer completes a todo through toggleComplete/moveTodoTo (useTodos.js:152-198). There, the status moves to/from the Done column and `createNextRecurrence` is called for recurring todos. The MCP `complete_todo` only flips `completed`. So a recurring task completed by an agent never spawns its next occurrence, and its kanban status stays unchanged. The same todo ends up in different states depending on which client completed it.

**Fix:** Call db.createNextRecurrence(id) when completing a todo that has recurrence_type. Mirror the Done-status transition, ideally through a shared helper in database.js.

### addTodoToStatus skips the Done-status completion sync

`src/renderer/mixins/todoActionsMixin.js:103` - correctness

`addTodoToStatus` creates the todo and then writes `todoData.status_id = statusId` straight through `window.api.updateTodo`. Every other status change goes through `todosComposable.moveTodoTo`, which uses `completionForStatus`/`applyCompletion` to tick `completed` and set `end_date` when a todo enters the Done column. So '+ Add' in the Done column creates a todo that sits in Done but has completed=0. That breaks completed counts, the show-completed filter, and archive-completed. The update is also a second write, so it adds a second undo-history entry, and unlike `addTodo` it sets no start_date.

**Fix:** After createTodo, call `this.todosComposable.moveTodoTo(todo, { statusId }, this.statuses)` (or apply applyCompletion and statusForCompletion). Better still, route creation through `todosComposable.addTodo(title, projectId, 'todo', { status_id, start_date })` so all creation paths behave the same.

### Global todo shortcuts stay active while modals or the fullscreen overlay are open

`src/renderer/mixins/keyboardShortcutsMixin.js:13` - correctness

handleKeyDown only skips the single-key shortcuts when the target is an input field or `showGlobalSearch` is true. With HelpModal, ImportDialog, ResetDatabaseModal or CardFullscreen open (and focus not in a text field), j/k, x/Space, Enter and Delete still act on the hidden list. For example, pressing Delete while the fullscreen overlay shows a card trashes the focused background todo. HelpModal has no Escape handling of its own, and the mixin's Escape branch only clears the selection, so Escape cannot close the help modal even though its own shortcut list says 'Esc: Close detail'.

**Fix:** Return early when any modal or overlay is open (showHelpModal, showImportDialog, showResetDialog, fullscreenTodoId), and close showHelpModal in the Escape branch.

### Error handling differs between actions; moveInboxTodoToProject changes local state before persisting

`src/renderer/mixins/todoActionsMixin.js:120` - consistency

Only addTodo, addTodoToProject and addTodoToStatus catch errors and call `showDbError`. All other actions (toggleComplete, deleteTodo, archiveCompletedTodos, emptyTrash, persistManualOrder, onKanbanDrop*, moveInboxTodoToProject) let IPC rejections escape as unhandled promise rejections, with no message to the user. `moveInboxTodoToProject` also does `todo.project_id = projectId` on the reactive todo before `await window.api.updateTodo(...)`. If the update fails, the UI shows the move even though nothing was saved. The mixin's JSDoc host contract also leaves out `showDbError`, which it depends on.

**Fix:** Wrap every IPC-backed action in one shared try/catch helper that calls showDbError. Build the update from `{ ...this.toPlainTodo(todo), project_id: projectId }` instead of mutating the prop. Add showDbError to the documented host contract.

### Reset can be triggered twice, so the backup path shown can be the already-emptied database

`src/renderer/components/ResetDatabaseModal.vue:18` - correctness

The Reset button (`:disabled="!confirmed"`) and `@keyup.enter="confirmed && $emit('confirm')"` stay enabled until the parent sets `result`. App.handleResetDatabase awaits `window.api.resetDatabase()` with no in-flight guard. Two quick confirmations (Enter then click, or a double click) run `database.reset()` twice. The second call renames the freshly emptied DB to a new backup, and the modal then shows that second backupPath as "The previous database was saved as". A user who follows the restore instructions would restore an empty database.

**Fix:** Add a local `pending` flag set on the first confirm, disable the button and Enter while it is set (or have the parent pass a `resetting` prop), and clear it when `result` arrives.

### Completion end_date is computed in UTC, not the local date

`src/renderer/composables/useTodos.js:140` - correctness

applyCompletion writes `todoData.end_date = new Date().toISOString().split('T')[0]`. That is the UTC calendar date. For users east of UTC who complete a todo after local midnight but before UTC midnight, or users west of UTC in the evening, the stored due date is off by one day. utils/dueDates.js says outright that toISOString() must not be used for this reason, and it provides formatLocalDate for the job.

**Fix:** Import formatLocalDate from '../utils/dueDates.js' and use `todoData.end_date = formatLocalDate(new Date())`.

### Startup mermaid config differs from the theme-change config

`src/renderer/utils/mermaid.js:9` - consistency

App.vue calls initializeMermaid(theme) at startup. That sets only theme and securityLevel. reinitializeMermaid(theme), which runs only on toggleTheme, adds the flowchart settings (htmlLabels, curve 'basis', spacing, padding) and the dark themeVariables. So the same diagram renders differently depending on whether the user has toggled the theme during the session. The two functions also duplicate the shared options.

**Fix:** Use one function that builds the full config for a theme, and call it both at startup and on theme change.

## Low

### setSetting/getSetting round trip changes the type of string values

`src/main/database.js:705` - correctness

setSetting stores strings as-is (`typeof value === 'string' ? value : JSON.stringify(value)`), while getSetting always runs JSON.parse. So the string 'dark' fails to parse and logs a warning on every read. That includes updater.js, which stores a version string like '9.9.9' and reads it on every update check. Strings that happen to be valid JSON come back as a different type: setSetting('k', 'true') returns boolean true, '123' returns a number, 'null' returns null. getAllSettings has the same asymmetry.

**Fix:** Always store JSON.stringify(value), so strings are saved with their quotes, and keep the raw-string fallback in getSetting only for rows written before the fix.

### reset()'s JSDoc block is attached to timestampedSiblingPath

`src/main/database.js:860` - docstring

The doc block that describes reset ('Replace the database with a freshly created one... @returns {string} Path of the backup file. @throws ...') sits directly above the timestampedSiblingPath docblock, so tooling attaches it to the wrong method and reset() has no docs.

**Fix:** Move the first docblock to just above `reset() {`.

### reset() error path reopens without init and can pair a new empty file with an orphaned WAL

`src/main/database.js:894` - correctness

If renameSync(this.dbPath, backupPath) succeeds but renaming '-wal' or '-shm' then fails, the catch block runs `new this.BetterSqlite3(this.dbPath)`. That creates a fresh empty database at dbPath next to the leftover -wal/-shm files from the old database, and the stale WAL frames can then be applied to the wrong file. The reopened handle also skips init(), so busy_timeout is not set and no schema exists. The JSDoc promise that 'the original database is reopened' only holds if the very first rename fails.

**Fix:** If the main file was already moved, rename it back before reopening, then call init() on the reopened handle. Alternatively, checkpoint with wal_checkpoint(TRUNCATE) before closing so no -wal file is left to move.

### Import size limit is checked after the whole file is already in memory

`src/main/index.js:655` - correctness

`readFileSync(importPath, 'utf-8')` loads the whole file before `fileContent.length > MAX_IMPORT_FILE_SIZE` is checked. The comment says the limit exists "to prevent memory issues", but a multi-GB file is fully read (or crashes the process) before the guard runs. `.length` also counts UTF-16 code units, not bytes, so the reported "max 50MB" is not what is measured.

**Fix:** Use `statSync(importPath).size` and reject before reading.

### Updater status events are sent on a channel nobody listens to, and the name collides with an invoke channel

`src/main/updater.js:163` - consistency

`sendStatusToWindow` emits `win.webContents.send('update-status', ...)`. The preload has no listener for it; a grep of src/ and tests/ finds no `onUpdateStatus` or `ipcRenderer.on('update-status')`. So all checking/available/downloading/error notifications are dropped. 'update-status' is also the ipcMain.handle channel for editing a kanban status (index.js:268, preload line 20), so the two unrelated features share a name.

**Fix:** Rename the push channel (e.g. 'updater-status') and expose an `onUpdaterStatus` subscription in the preload. Or remove sendStatusToWindow if the UI will not show updater status.

### Focus adjustment after Delete never runs

`src/renderer/mixins/keyboardShortcutsMixin.js:135` - correctness

`this.deleteTodo(id)` is async and is not awaited. The very next line checks `if (this.focusedTodoIndex >= this.navigableTodos.length)`, but the list has not reloaded yet, so the length is unchanged and the check is always false. After deleting the last item, focusedTodoIndex points past the end, so `focusedTodo` is null and no card shows focus. The promise is also left floating, so a failure becomes an unhandled rejection.

**Fix:** Make handleKeyDown's Delete branch `await this.deleteTodo(...)` (the handler can be async, or use `.then`), then clamp focusedTodoIndex against the reloaded navigableTodos.

### mounted() aborts entirely if initial data load fails

`src/renderer/App.vue:680` - correctness

`await this.loadData()` runs first in mounted with no try/catch. If any IPC call rejects (for example a DB error), the rest of mounted never runs. The keydown/focus listeners, onRefreshTodos, onHistoryChanged, the external-link click handler and the resize observer are never registered, and the user gets no message (the dbError banner exists but is not used here).

**Fix:** Wrap loadData in try/catch and call showDbError, then continue registering listeners.

### Computed properties change composable state as a side effect

`src/renderer/App.vue:552` - design

`sortedTodos()` calls `this.todosComposable.setSortBy(this.sortBy)`, and `filteredTodos()` calls `setCurrentFilter`/`setSearchQuery`/`setShowCompleted` before reading `filteredTodos.value`. Writing reactive state inside a computed getter is a Vue anti-pattern. Whether the composable state is correct depends on which computed happens to be evaluated first. For example, `sortedTodos` reads `todosComposable.sortedTodos`, which is based on the composable's filteredTodos, but nothing guarantees App's `filteredTodos` getter (which pushes the filter state) has run first. This can also trigger recursive-update warnings.

**Fix:** Push these values into the composable from watchers with `immediate: true` (or pass refs into useTodos), and keep the computeds pure.

### Project tag props and events are passed to ProjectModal but nothing declares or handles them

`src/renderer/components/ProjectModal.vue:23` - correctness

App.vue (lines 83-89) renders `<ProjectModal :project-tags="editingProjectTags" :all-tags="allTags" @add-tag="addProjectTag" @remove-tag="removeProjectTag">`. ProjectModal declares only `project` and `colors` props and emits only ['save','cancel','delete']. EntityModal does not declare these either. A grep of src shows that `editingProjectTags`, `allTags`, and the renderer methods `addProjectTag`/`removeProjectTag` are not defined anywhere in the renderer; they exist only in main/preload. As a result the bindings read undefined instance properties (Vue warns at render), they fall through as attributes onto EntityModal's root (or cause an 'extraneous non-props attributes' warning when that root is a v-if comment), and project tag editing cannot be reached from the UI even though the IPC exists.

**Fix:** Either add projectTags/allTags props and add-tag/remove-tag emits to ProjectModal/EntityModal and implement the App.vue state and methods, or remove the dead bindings from App.vue.

### formatDate brings back the UTC/time-of-day due-date bug that dueDates.formatDeadline fixes

`src/renderer/components/ItemPreview.vue:31` - correctness

`const date = new Date(dateString)` reads a `YYYY-MM-DD` end_date as UTC midnight, and `Math.ceil((date - now) / 864e5)` measures from the current time, not from local midnight. Example: in UTC-5 at 20:00, a todo due today gives diff ≈ -1.04, which ceils to -1, so it shows 'Yesterday'. Example: in UTC+1 at 00:30, a todo due today gives +0.5h, which ceils to 1, so it shows 'Tomorrow'. utils/dueDates.formatDeadline was written to avoid exactly this (local parse, midnight base, Math.round). The cards also show 'Nd' for dates within a week, which the tooltip does not.

**Fix:** Remove formatDate and import formatDeadline from '../utils/dueDates.js'.

### No Status column ignores the sort order and the deleted filter that the status columns apply

`src/renderer/components/KanbanView.vue:104` - consistency

Status columns come from `getStatusTodos(status.id)`, which filters `allTodos`. App passes `sortedKanbanTodos` for allTodos, whose comment says 'Kanban columns must honour the sort dropdown'. The No Status column instead uses the separate `noStatusTodos` prop, which App builds from the unsorted `filteredTodos`. It also skips the `!t.deleted` check. So the first column ignores the chosen sort while every other column follows it. The stacked layout handles this correctly through `getProjectStatusTodos(group.id, null)`.

**Fix:** Build the no-status column from allTodos as well, e.g. a `noStatusColumnTodos` computed: `allTodos.filter(t => !t.status_id && !t.deleted)`. Then drop the `noStatusTodos` prop.

### loadTodos clears the list before awaiting and has no protection against stale responses

`src/renderer/composables/useTodos.js:94` - correctness

`state.todos = []; state.todos = await window.api.getTodos(filter)`. Every mutation (toggleComplete, handleUpdateTitle, setDueDate, ...) calls loadTodos(state._currentFilter). Vue flushes the empty array while the IPC call is pending, so a filtered view briefly goes empty: the list flickers, scroll position and masonry layout are lost. Nothing guards against overlapping calls either. If a mutation-triggered reload for filter A resolves after the user has switched to filter B, the late response overwrites state.todos with A's todos.

**Fix:** Drop the `state.todos = []` reset. Add a request counter (or compare the filter against state._currentFilter after the await) so that only the latest response is applied.

## Appendix: unverified notes

- `src/main/validators.js:288` (correctness) validateUrl replaces its own protocol error with a generic message
- `src/main/validators.js:245` (consistency) validateStatus and the create-status handler fall back to the project default color
- `src/main/validators.js:206` (naming) validateOptionalPositiveInt returns 1 instead of null when the value is missing
- `src/main/validators.js:319` (dead-code) validateSettingKey / validateSettingValue are only used by tests
- `src/main/database.js:719` (dead-code) getAllSettings and linkMilestoneTodo are only used by tests
- `src/main/database.js:532` (docstring) Misleading '// Milestone operations' section comment above reorder methods
- `src/main/legacyData.js:31` (correctness) Copying the legacy data stops halfway on error, and the next launch skips it
- `src/main/index.js:379` (correctness) "Only if there was an actual change" check almost always passes because updated_at changes
- `src/main/importExport.js:149` (docstring) Comment claims missing todo columns default to null/0, but undefined fields bypass column DEFAULTs
- `src/main/importExport.js:36` (naming) Parameter `importData` shadows the exported function of the same name
- `src/main/index.js:641` (consistency) IPC handlers are inconsistently wrapped and return inconsistent error contracts
- `mcp-server/tools.js:211` (docstring) search_todos description and behaviour are misleading
- `src/main/logger.js:58` (correctness) error() mutates the caller's context object; Error objects in warn/info serialize to {}
- `src/main/index.js:364` (consistency) history-changed sends use `if (mainWindow)` without the isDestroyed guard used elsewhere
- `mcp-server/server.js:29` (consistency) Hard-coded MCP server version diverges from package version
- `src/renderer/App.vue:726` (correctness) Global listeners are registered but never removed
- `src/renderer/App.vue:690` (consistency) Saved 'archive' filter is not restored on startup
- `src/renderer/App.vue:521` (dead-code) Unused computeds and never-set state: inboxCount, todos, showProjectsOverview
- `src/renderer/App.vue:373` (dead-code) Leftover tab machinery: activeTab, tabViews per tab, setTab
- `src/renderer/mixins/todoActionsMixin.js:33` (dead-code) updateStatusTodos is an empty handler
- `src/renderer/mixins/todoActionsMixin.js:180` (correctness) emptyTrash overwrites the freshly loaded trash count and ignores errors
- `src/renderer/components/GlobalSearch.vue:215` (correctness) Out-of-order search responses can overwrite newer results
- `src/renderer/components/HomeLanding.vue:12` (correctness) Stale draggingTodo after a cancelled drag lets an unrelated drop move a todo
- `src/renderer/components/HelpModal.vue:26` (naming) Cmd+K is labelled 'Command palette' but it opens global search
- `src/renderer/components/ResetDatabaseModal.vue:35` (correctness) Failure message claims the database was left unchanged, which is not always true
- `src/renderer/components/GlobalSearch.vue:82` (correctness) Whitespace-only query shows 'No results found' and stale results show while clearing
- `src/renderer/components/GlobalSearch.vue:147` (dead-code) Tag search results are fetched but never used
- `src/renderer/components/AppSidebar.vue:339` (dead-code) Unused scoped CSS selectors
- `src/renderer/components/AppSidebar.vue:212` (consistency) Mouse enter/leave passed as Function props instead of emitted events
- `src/renderer/components/index.js:0` (consistency) Barrel export is incomplete, so App.vue imports some components directly
- `src/renderer/components/CardsView.vue:313` (correctness) Shrinking the marquee box to cover no cards leaves the previous marquee selection in place
- `src/renderer/components/cardInteractionsMixin.js:96` (correctness) saveNotes emits an update when notes were null and nothing was typed
- `src/renderer/components/ItemPreview.vue:26` (consistency) renderNotes copies the mermaid-placeholder logic from utils/markdown.renderCardNotes
- `src/renderer/components/ItemPreview.vue:11` (dead-code) position prop and positionStyle computed are never used by any caller
- `src/renderer/components/cardInteractionsMixin.js:147` (correctness) clampContextMenu cannot keep a menu taller than the viewport usable
- `src/renderer/components/EntityModal.vue:105` (correctness) save() checks the trimmed name but emits it untrimmed
- `src/renderer/components/NotesEditor.vue:16` (docstring) Multi-cursor keymap comment does not match the non-mac binding, which overrides CodeMirror's move-line
- `src/renderer/components/CardsView.vue:114` (dead-code) getCardStyle never uses its todoId parameter
- `src/renderer/composables/useMasonry.js:53` (correctness) Resize observer and timers are not cleaned up properly
- `src/renderer/utils/localStorageValidation.js:16` (correctness) Validates a dead 'current-view' key and allows a non-existent 'calendar' view
- `src/renderer/composables/useStatuses.js:172` (dead-code) isInitialized / isLoading are never used
- `src/renderer/composables/useStatuses.js:27` (correctness) A forced reload is silently skipped while another load is in flight
- `src/renderer/utils/helpers.js:8` (consistency) Two sets of palettes: projectColors/statusColors are only fallback defaults that App.vue always overrides
- `src/renderer/utils/markdown.js:242` (consistency) Mermaid placeholder regex handles only backtick fences and is duplicated in ItemPreview.vue
- `src/renderer/composables/useProjects.js:110` (consistency) deleteProjectConfirm lacks the null guard its status sibling has
- `src/renderer/composables/useTodos.js:352` (docstring) setSortBy JSDoc omits the 'due' mode
- `src/config/constants.js:34` (naming) MAX_ARRAY_SIZE holds non-array limits

## Refuted during verification

- src/main/database.js:49 PRAGMA foreign_keys is never enabled, so ON DELETE CASCADE / SET NULL clauses never run
- src/renderer/utils/mermaid.js:102 Re-rendering after a theme change reads SVG instead of diagram source, and the error is swallowed
