# Changelog

All notable changes to this project are documented in this file. Versions correspond to git tags and GitHub releases; dates use YYMMDD format. Version bumps that were never tagged (0.1.0, 0.3.0-0.3.7, 0.4.x, 0.5.0) are folded into the release that shipped them.

## Unreleased

### Security

- Seven advisories patched, lockfile only: fast-uri to 3.1.7 (GHSA in the 3.0.0-3.1.5 range, reached at runtime through the app and the MCP server), qs to 6.16.0 in the MCP server, browserslist to 4.28.9, @xmldom/xmldom to 0.8.15, @humanfs/node to 0.16.8, and postcss-selector-parser to 7.1.6. `npm audit` now reports no vulnerabilities in either package tree.

### Fixed

- The sidebar still read "Todo" after the rename. It now shows the product name, and a test fails if the two drift apart.

## 0.8.3 - 260905

### Changed

- The application is now called Ordo. The window title, which still read "Todo List", now follows the product name, and a test fails if the two drift apart. The name Todo was unsearchable and its bundle identifier, `com.todo.app`, claimed a domain that is not ours, which would have had to change before the build could be signed. The identifier is now `net.sorenwacker.ordo` and the repository is `sorenwacker/ordo`; GitHub redirects the old paths, so existing installations still find updates.

### Added

- Data is carried across the rename. Electron derives its user data directory from the application name, so the rename alone would have opened an empty database beside the user's real one, which is indistinguishable from losing every todo. On first launch the database, its write-ahead log, and any backups are copied from the old `todo` directory into the new `ordo` one. The copy runs only when the new directory has no database, and the old directory is left untouched so an older build still opens its own data. See [Renaming](docs/renaming.md).

- The repository now ships the licence it grants. `LICENSE` holds the Apache License 2.0 and `NOTICE` the copyright statement redistributions must preserve; `package.json` declares `Apache-2.0`. Previously the only statement of a licence anywhere was a line in the README claiming MIT, with no licence file and no `license` field to back it.

### Fixed

- The README documented only the macOS download, though every release also builds Windows (NSIS installer and portable executable) and Linux (AppImage and deb). All three are now listed with their asset names.
- The README did not say that the macOS build is Apple silicon only, so an Intel Mac user had no warning before downloading a build that cannot run. The architecture limits for macOS and Linux are now stated.
- The project structure listed five of the eight modules in `src/main/`, and the documentation index linked six of the eight pages under `docs/`. Both are complete, and a test now fails when either drifts again.
- The Development section did not mention the Makefile targets, `lint:fix`, `format` or `format:check`, and the Building section did not mention `install:mac` or how releases are cut.

### Removed

- `docs/REVIEW.md`, a point-in-time audit snapshot dated 260719 that documented no current behaviour.

## 0.8.2 - 260905

### Added

- Card width in the cards view is now a setting. A S/M/L control next to the Row/Card switcher chooses the minimum card width the auto-fill grid packs to (320px, 440px, 600px); the grid was previously fixed at a 320px minimum. The default is M, so cards are wider than before. The choice persists per machine.

### Fixed

- A card title can be double-clicked to rename it again. The first click of the pair reached the card underneath, which toggled it open or shut; the height change re-ran the masonry layout and moved the title out from under the pointer before the second click landed. Wider cards move it further, so the wider default made it near-impossible. The title now consumes its own single clicks; the rest of the card still expands and selects as before.
- Switching to another application no longer closes whatever was being edited. A card title, card or kanban note, project note, or half-typed project/status name lost its editor the moment the window lost focus, because the blur that ends an edit session could not be told apart from the blur the OS raises on an application switch. Blurs raised while the window itself is unfocused are now ignored, and focus returns to the editor when the window does. A click elsewhere inside the app still ends the edit as before.

## 0.8.1 - 260902

### Fixed

- An empty bullet typed under a nested list (a bare `-` with no text) no longer turns the parent item into a heading. Marked read the bare marker as a setext heading underline, so the parent rendered bold and its sub-bullets collapsed into it as literal `- ` text. Indented empty markers now render as an empty bullet.

### Security

- nanoid 3.3.17 to 3.3.18 for GHSA-2v37-7h3g-55p8, where a custom generator called with size zero loops indefinitely. Lockfile-only, reached through vite and postcss.

## 0.8.0 - 260827

### Added

- A status named "Done" is now linked to the completion checkbox in both directions: ticking a card's box moves it into that column, dropping a card into that column ticks its box, and reversing either un-completes the card and moves it to "No Status". Boards with no status named "Done" are unaffected.

### Fixed

- The created and completed dates on a kanban card no longer run together as one line of text. The row was styled only for the cards view, so on the board it rendered with no gap, at body size, in body colour; the rule is now shared by both card types.
- Kanban card titles no longer wrap one character per line on narrow windows. Everything in a card header except the title is fixed width and costs 149px, while the column floor fell to 160px below 900px viewport width, leaving the title 11px wide. Columns now stop shrinking at 260px and the board scrolls sideways instead.

## 0.7.3 - 260811

### Fixed

- Kanban cards can be dragged to another status or project section when "Group by project" is on. The drop handler read the column the drag started in rather than the one it ended in, so every move was written back as its own original position.

### Security

- dompurify 3.4.12 to 3.4.13 for GHSA-55q2-fjhq-7xh7, where removing an IN_PLACE hook leaves a detached subtree executable. Lockfile-only, within the declared range; applies to both the direct dependency and mermaid's copy.

## 0.7.2 - 260807

### Added

- A complete changelog covering all releases, linked from the README.

### Security

- Patched all 26 dependency advisories open across the app and MCP server lockfiles: undici, tar, postcss, brace-expansion, mermaid, and js-yaml in the app; ip-address, fast-uri, hono, and @hono/node-server in the MCP server. electron-builder moved to 26.15.3 for the app-builder-lib and builder-util-runtime fixes. All updates are lockfile-only, within declared semver ranges.

## 0.7.1 - 260806

### Changed

- Renamed the notes Preview mode to View, since rendered notes are the resting state.
- Flattened the markdown heading scale: headings stay at or above body text size, body text reduced to 13px, h1 distinguished by a wider size step.
- Aligned the README with the app after category/person removal and recent features.

### Fixed

- Blank lines typed in notes are preserved in the rendered view instead of being collapsed.
- Clicking a rendered note focuses the editor directly, so editing no longer needs a second click.

## 0.7.0 - 260723

Version bump promoting the 0.6.x series, including the MCP server, to a minor release. No code changes beyond 0.6.8.

## 0.6.8 - 260723

### Added

- MCP server so AI assistants can read and write todos (see docs/mcp-server.md).

## 0.6.7 - 260722

### Fixed

- The updater on unsigned macOS builds no longer promises an automatic install it cannot perform, and notifies once per new version instead of prompting repeatedly.

## 0.6.6 - 260722

### Added

- Database schema versioning via PRAGMA user_version with pre-migration backups; the app refuses database files from newer versions instead of corrupting them.

## 0.6.5 - 260722

### Added

- Database reset flow so users can recover from an unusable database file without manual file surgery.

### Fixed

- Add-todo failures are surfaced in the UI so schema problems are diagnosable.

## 0.6.4 - 260722

### Changed

- The Cards/Kanban switcher stays fixed in the header, with the Row/Card toggle placed to its left.

## 0.6.3 - 260721

### Changed

- Project notes moved into a resizable, preview-first left column.
- Card previews show the full note instead of only the first paragraph.

## 0.6.2 - 260721

### Changed

- Reworked cards into a Row/Card square layout with note previews, card columns that adapt to window width, and fixed light-mode contrast.

## 0.6.1 - 260721

### Changed

- Projects and statuses share one entity color palette.
- The show-completed setting persists, and the entity modal receives focus when opened.

### Fixed

- Recurring todos keep their stop date when edited (recurrence_end_date was dropped on save).
- Undo history is cleared on import so undo cannot target replaced rows.
- Todo-creation failures are surfaced instead of swallowed silently.
- Restored the main-content flex column so the columns slider pins to the bottom.

### Removed

- Orphaned milestone_todos and tag-search database methods.

## 0.6.0 - 260720

Rolls up the untagged 0.4.0, 0.4.1, and 0.5.0 work, including a full hygiene and security audit with two remediation passes.

### Added

- Due dates on items, a By Due Date sort option, inline due-date editing with a native date picker, and a themed context menu.
- Persistent per-project notes so context survives across sessions.
- The All kanban view grouped by project.
- Icon-button tooltips.
- Component tests covering card, search, and dialog behavior.

### Changed

- Drag-and-drop order persists from the dragged array instead of read-only computeds.
- The App god-component was broken into header, landing, dialogs, and focused mixins; the monolithic stylesheet split into ordered feature slices; schema management and backup logic split out of the database class.
- Undo/redo is scoped to the app window instead of a global shortcut.
- Node 24 is pinned so fresh installs target a supported, tested toolchain.
- The theme toggle renders as an icon so it stays visible on all macOS versions.
- Updated the app icon artwork.

### Fixed

- Navigated or popup pages no longer inherit the preload IPC surface.
- Backups round-trip without dropping tables or todo fields.
- Markdown rendering no longer corrupts fenced code blocks or standard-indented lists.
- Update dialogs keep working after the window is recreated on macOS.
- Keyboard and search selection received real focus behavior instead of a silent stub.
- The due-date sort preference and project save failures are no longer silently discarded.
- Known dependency vulnerabilities patched.

### Removed

- The unreachable timeline/calendar subsystem, unused dependencies, vestigial Python scaffolding, and stylesheets for views unreachable from the UI.

## 0.3.9 - 260615

Rolls up the untagged 0.3.0-0.3.7 work.

### Added

- Tags and topics on items.
- Split view with drag-and-drop, graph filter, and lasso selection.
- Notes editing and an archive action on kanban cards; archive/trash improvements with undo integration.
- Auto-scroll in kanban and table views.
- A Makefile with project aliases.
- Automatic better-sqlite3 rebuild for the correct Electron ABI.

### Changed

- Card button text replaced with Lucide icons.
- Prettier formatting applied across the codebase.
- Tests exercise the real Database and ActionHistory classes instead of diverged copies.
- Filtered views reload after mutations so changes appear in real time.

### Fixed

- Todo persistence gaps in the database layer.
- IPC listener leaks in the preload unsubscribe path.
- Graph node drag stability and graph view layout.
- Light theme backgrounds for the app shell, inbox items, and search input.

### Removed

- The stakeholder register, simplifying the app to core todo functionality.
- Dead code from removed features across backend and renderer, plus orphaned components.

### Security

- Upgraded Electron to 39 and better-sqlite3 to fix known vulnerabilities.

## 0.2.9 - 260112

### Added

- Settings, todo types, and global search with shared utilities.
- Per-tab view memory and expandable subtasks.
- Milestone many-to-many relationships, calendar views, and inline stakeholder editing.
- Graph view enhancements.

### Changed

- Dark mode changed to pitch black.
- Modals refactored to use a shared EntityModal.

### Fixed

- Undo/redo, grid lock, kanban icons, subtask toggle, and card size UI.
- Kanban group-by-project and subtask display in cards and table view.
- Escape closes the detail view (exiting fullscreen first) and notes autosave on close.

## 0.2.4 - 260109

### Fixed

- Added an afterSign hook for proper macOS ad-hoc code signing.

## 0.2.3 - 260109

### Fixed

- Corrected the GitHub owner in the publish config, added the author field for the Linux deb package, and fixed macOS code signing with an ad-hoc identity.

## 0.2.2 - 260107

### Added

- Sidebar auto-collapse, fullscreen detail panel, and stacked kanban view.

### Fixed

- Sidebar auto-collapse and fullscreen detail panel height in production builds.

## 0.2.1 - 251226

### Added

- Undo/redo UI, help modal, and subtasks on cards.
- Subtask progress bar and drag-and-drop reordering.
- Timeline improvements: double-click to create, resize handles, better date handling.
- Auto-updates and component extraction.
- Markdown support in person notes.

### Fixed

- Dev/prod database path resolution and kanban project filtering.
- localStorage validation on startup.

## 0.2.0 - 251217

Includes the untagged 0.1.0 work.

### Added

- Persons/contacts registry with many-to-many relationships for todos and projects.
- Stakeholder register for projects with a dedicated matrix visualization window and stakeholder analysis fields.
- Sensitive notes with reveal confirmation.
- Grid lock for the masonry card layout.
- Project documentation.

### Fixed

- Kanban drag-and-drop, markdown rendering, autosave, external link opening from notes, and masonry card resize behavior.

### Security

- Updated dependencies to fix known vulnerabilities.
- Disabled code signing for unsigned distribution.

## 0.0.0 - 251210

### Added

- Initial Electron todo list app with Vue 3.
- Export/import, theming, card layout, and drag-and-drop.
- electron-builder packaging and a GitHub Actions release workflow.
