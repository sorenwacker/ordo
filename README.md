# Ordo

A desktop task manager built with Electron and Vue 3. Local-first: all
data lives in a single SQLite file on your machine, with no account and no
network dependency.

## Features

- **Projects and statuses**: organize todos into color-coded projects with
  customizable statuses; per-project topic buckets and cross-cutting tags
- **Views**: cards, kanban, and list layouts with drag-and-drop reordering
- **Milestones**: hierarchical todos with milestone dates and groupings
- **Markdown notes**: per-todo and per-project notes with syntax
  highlighting and mermaid diagrams; notes can be marked sensitive to keep
  them hidden until explicitly revealed (a display flag, not encryption)
- **Dates and recurrence**: start/end dates, recurring tasks, importance
  ratings (1-5)
- **Archive and trash**: soft delete with recovery, archive for completed
  work, undo/redo
- **Export/import**: JSON backup with merge or replace
- **MCP server**: AI assistants (e.g. Claude Code) can read and write todos
  through a Model Context Protocol server sharing the same database
- **Database safety**: schema versioning with pre-migration backups; the
  app refuses files from newer versions instead of corrupting them, and a
  guarded reset can recover from an unusable database file

## Documentation

- [Database compatibility](docs/database-compatibility.md) — schema
  versioning, migrations, backups
- [Reset database](docs/reset-database.md) — recovering from an unusable
  database file
- [Auto-update](docs/auto-update.md) — per-platform update behavior and
  how to enable signed macOS builds
- [MCP server](docs/mcp-server.md) — exposing the database to AI assistants
- [Renaming](docs/renaming.md) — the move from Todo to Ordo and the data migration it required
- [Cards view](docs/cards.md) — row/card layout modes and the card width setting
- [Kanban view](docs/kanban.md) — the two board layouts and when each one renders
- [Notes](docs/notes.md) — the markdown pipeline and editor shared by todo and project notes
- [Inline editing](docs/editing.md) — where editing happens in place and how edit sessions survive an application switch

## Installation

### Option A: Download a prebuilt release (recommended)

Most users should not build from source. Download the packaged app from the
[Releases page](https://github.com/sorenwacker/ordo/releases):

- **macOS**: download `Ordo-<version>-arm64.dmg`, open it, and drag `Ordo.app` into `Applications`.
- **Windows**: download `Ordo-Setup-<version>.exe` for the installer, or `Ordo-<version>.exe` for a portable build that needs no installation.
- **Linux**: download `Ordo-<version>.AppImage` (mark it executable with `chmod +x`), or `ordo_<version>_amd64.deb` for Debian and Ubuntu.

**The macOS build is Apple silicon only.** It is built for `arm64` and no x64 or universal target is produced, so it will not run on an Intel Mac. The Linux packages are x86_64 only for the same reason. On either platform, build from source to target a different architecture.

The macOS build is not code-signed. On first launch, right-click `Ordo.app` and choose **Open** (or allow it under **System Settings > Privacy & Security**) to get past Gatekeeper. Because the build is unsigned, macOS cannot install updates automatically; the app notifies once per new version instead (see [Auto-update](docs/auto-update.md)).

### Option B: Build from source

Building compiles the native `better-sqlite3` module, so a C/C++ toolchain and a
supported Node version are required.

#### Prerequisites
- **Node.js 24 LTS** (pinned in `.nvmrc`). With [nvm](https://github.com/nvm-sh/nvm):
  `nvm install` then `nvm use` in the project directory. Newer Node versions
  (e.g. 26) are not yet validated against the native dependencies and can leave a
  half-built install.
- **Xcode Command Line Tools** (macOS): `xcode-select --install`. Without them the
  `better-sqlite3` native build fails, which is the most common cause of a fresh
  install that opens but cannot save data.

#### Setup
```bash
# Clone the repository
git clone https://github.com/sorenwacker/ordo.git
cd ordo

# Use the pinned Node version
nvm use

# Install dependencies
npm install
```

The native module is rebuilt for the correct target automatically when you run
the app or the tests; see [Development](#development) below.

## Development

The Makefile wraps the common tasks and is the shortest way in:

```bash
make dev          # start the app in development mode
make build        # build the renderer/main bundles
make dist         # package a macOS distributable (regenerates icons first)
make install-mac  # build and install into /Applications
make clean        # remove dist/, out/ and generated icons
```

The underlying npm scripts, for anything the Makefile does not cover:

```bash
# Start development server (rebuilds better-sqlite3 for Electron first)
npm run dev

# Run tests (rebuilds better-sqlite3 for Node first)
npm test

# Run tests in watch mode
npm run test:watch

# Lint, and fix what can be fixed automatically
npm run lint
npm run lint:fix

# Format, or check formatting without writing
npm run format
npm run format:check
```

better-sqlite3 is a native module whose binary must match the runtime ABI:
Electron for the app, Node for the test runner. The `dev`/`preview` and `test`
scripts rebuild it for the correct target automatically via their `pre*` hooks,
so switching between running the app and running tests needs no manual step.
The MCP server keeps its own `node_modules` for the same reason (see
[docs/mcp-server.md](docs/mcp-server.md)).

## Building

```bash
# Build the renderer/main bundles
npm run build

# Package a distributable for the current platform
npm run dist

# Package for a specific platform
npm run dist:win
npm run dist:mac
npm run dist:linux

# Build and install into /Applications (macOS)
npm run install:mac
```

Built applications are written to the `dist/` directory. Releases are cut by pushing a `v*` tag, which runs `.github/workflows/release.yml` across macOS, Windows and Linux runners; `npm run dist` builds locally without publishing.

## Architecture

### Technology Stack
- **Frontend**: Vue 3 with Composition API
- **Desktop Framework**: Electron 39
- **Build Tool**: electron-vite
- **Database**: better-sqlite3 (WAL mode, shared with the MCP server)
- **Markdown Parser**: marked
- **Diagram Rendering**: mermaid
- **UI Components**: lucide-vue-next (icons), vuedraggable

### Project Structure
```
src/
├── main/          # Electron main process
│   ├── index.js        # Application entry point, IPC handlers
│   ├── database.js     # SQLite operations
│   ├── schema.js       # Schema, migrations, verification
│   ├── validators.js   # Input validation for IPC payloads
│   ├── legacyData.js   # One-time copy of data from the previous app name
│   ├── importExport.js # JSON backup import and export
│   ├── updater.js      # Auto-update behavior
│   ├── logger.js       # Main-process logging
│   └── history.js      # Undo/redo state management
├── preload/       # Preload scripts (IPC bridge)
├── renderer/      # Vue application
└── config/        # Shared constants
mcp-server/        # Standalone MCP server (own node_modules)
docs/              # Documentation
tests/             # Vitest test suite
```

### Database Schema
SQLite with the following tables: `todos`, `projects`, `statuses`,
`project_topics`, `tags`, `todo_tags`, `project_tags`, `todo_links`,
`milestone_todos`, `settings`. The schema is versioned via
`PRAGMA user_version`; see
[docs/database-compatibility.md](docs/database-compatibility.md).

## Data Locations

- **macOS**: `~/Library/Application Support/ordo/`
- **Windows**: `%APPDATA%/ordo/`
- **Linux**: `~/.config/ordo/`

Database file: `todos.db`. Backups created by resets and migrations sit next to it, named `todos-backup-*.db` and `todos-premigrate-*.db`.

The application was named Todo before 0.9.0, and Electron derives this directory from the application name. On first launch after the rename the database, its write-ahead log, and any backups are copied from the old `todo` directory into the new one. The copy runs only when the new directory has no database yet, and the old directory is left untouched, so an older build still opens its own data. See [Renaming](docs/renaming.md).

## Contributing

1. Fork the repository
2. Create a feature branch
3. Update documentation, add tests, then implement
4. Submit a pull request

## License

Licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for the copyright statement that redistributions must preserve.

## Version History

See [CHANGELOG.md](CHANGELOG.md) or the [Releases page](https://github.com/sorenwacker/ordo/releases).
