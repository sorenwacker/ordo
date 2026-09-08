# MCP Server

A standalone Model Context Protocol server that exposes the Ordo database
to AI assistants (e.g. Claude Code) over stdio. It runs independently of
the Electron app and both processes may use the database at the same time.

## Location and dependencies

`mcp-server/` in the repository, with its own `package.json` and
`node_modules`. The isolation is deliberate: the app rebuilds
`better-sqlite3` for Electron's Node ABI (`npm run dev`/`build`), which
would break a server sharing the root `node_modules`. The server depends on
`@modelcontextprotocol/sdk` and `better-sqlite3` built for system Node.

The server reuses the app's `Database` class (`src/main/database.js`),
so schema versioning applies unchanged: a database stamped by a newer app
version is refused, migrations and verification run identically.

## Database path

Resolved in this order:

1. `ORDO_DB_PATH` environment variable.
2. `TODO_DB_PATH` environment variable, honoured for setups that predate the
   rename. It is deprecated: the server writes a notice to stderr when it is
   used and it will be dropped in a later release.
3. The platform default used by the app: `~/Library/Application Support/ordo/todos.db`
   (macOS), `%APPDATA%/ordo/todos.db` (Windows), `~/.config/ordo/todos.db`
   (Linux).

The directory name is the application name, so it changed with the rename
(see [Renaming](renaming.md)). The server resolves the current name only; it
does not look in the `todo` directory the application used before 0.8.3.

On a machine upgraded from Todo, launch the application once before using the
server. The application copies the old database forward on first launch, but
only while the new directory holds no `todos.db`. A server started first
creates an empty database there, and that copy is then skipped for good.

## Concurrency

The database runs in WAL journal mode (set persistently by whichever
process opens it first) with a 5-second busy timeout on both sides, so
app and server writes interleave safely. Before file copies (pre-migration
backup) the WAL is checkpointed so backups are complete.

The app watches its database file and reloads the UI shortly after an
external process writes to it, so todos added through the server appear
without a restart.

## Tools

| Tool | Purpose |
| --- | --- |
| `list_projects` | Active projects: id, name, color. |
| `list_todos` | Todos with optional filters: `project` (name or id), `status` (name), `include_completed` (default false). |
| `add_todo` | Create a todo: `title` (required), `project` (name or id), `notes`, `start_date` (defaults to today), `end_date`, `importance` (1-5), `status` (name), `type` (`todo`/`note`/`milestone`). |
| `update_todo` | Update fields of a todo by `id`: `title`, `notes`, `start_date`, `end_date`, `importance`, `status`, `project`. |
| `complete_todo` | Set a todo's completed state by `id` (`completed` defaults to true). |
| `search_todos` | Full-text search over titles, notes, projects, and tags. |

Rules enforced by the server, matching the app: titles are required,
trimmed, and length-limited (same `MAX_LENGTH` constants); unknown project,
status, or todo ids return errors rather than creating anything implicitly;
soft-deleted and archived todos are excluded from listings.

## Registration

    claude mcp add --scope user ordo -- node <repo>/mcp-server/server.js

Any MCP-capable client can use the same command line.
