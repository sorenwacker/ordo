/**
 * Database schema creation, migrations, and verification.
 */

/**
 * Version of the schema this build of the app understands. Stored in the
 * database file via PRAGMA user_version. Increment together with any schema
 * change and its migration step. 0 marks databases from before versioning.
 */
export const SCHEMA_VERSION = 2

// Full current column set of the todos table. Used both for creating fresh
// databases and as the rebuild target when repairing legacy tables, so the
// two can never drift apart.
const TODOS_COLUMNS_DDL = `
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      notes TEXT DEFAULT '',
      deadline TEXT,
      completed INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      importance INTEGER DEFAULT NULL,
      project_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      start_date TEXT,
      status_id INTEGER,
      end_date TEXT,
      deleted_at TEXT,
      recurrence_type TEXT,
      recurrence_interval INTEGER DEFAULT 1,
      recurrence_end_date TEXT,
      notes_sensitive INTEGER DEFAULT 0,
      type TEXT DEFAULT 'todo',
      parent_id INTEGER REFERENCES todos(id) ON DELETE SET NULL,
      milestone_date TEXT,
      topic_id INTEGER REFERENCES project_topics(id) ON DELETE SET NULL,
      completed_at TEXT,
      archived_at TEXT,
      deleted_project_id INTEGER,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
`

// Columns the code relies on, checked by verifySchema after opening.
const REQUIRED_COLUMNS = {
  projects: ['id', 'name', 'color', 'notes', 'sort_order', 'deleted_at'],
  statuses: ['id', 'name', 'color', 'sort_order'],
  todos: [
    'id',
    'title',
    'notes',
    'completed',
    'sort_order',
    'importance',
    'project_id',
    'start_date',
    'status_id',
    'end_date',
    'deleted_at',
    'recurrence_type',
    'recurrence_interval',
    'recurrence_end_date',
    'notes_sensitive',
    'type',
    'parent_id',
    'milestone_date',
    'topic_id',
    'completed_at',
    'archived_at',
    'deleted_project_id'
  ]
}

/**
 * Create all tables if they do not exist.
 * @param {Object} db - better-sqlite3 database handle
 */
export function createTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#0f4c75',
      notes TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS project_topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#666',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, name)
    );

    CREATE TABLE IF NOT EXISTS todos (
${TODOS_COLUMNS_DDL}
    );

    CREATE TABLE IF NOT EXISTS todo_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL,
      target_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_id) REFERENCES todos(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES todos(id) ON DELETE CASCADE,
      UNIQUE(source_id, target_id)
    );

    CREATE TABLE IF NOT EXISTS statuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#3498db',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS milestone_todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      milestone_id INTEGER NOT NULL,
      todo_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (milestone_id) REFERENCES todos(id) ON DELETE CASCADE,
      FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
      UNIQUE(milestone_id, todo_id)
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS todo_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      todo_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
      UNIQUE(todo_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS project_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
      UNIQUE(project_id, tag_id)
    );
  `)
}

/**
 * Add a column to a table, ignoring the error when it already exists.
 * @param {Object} db - better-sqlite3 database handle
 * @param {Object} log - logger instance
 * @param {string} table - table to alter
 * @param {string} columnDdl - column definition, e.g. "importance INTEGER DEFAULT NULL"
 * @param {string} [label] - migration label for log messages; defaults to
 *   "ADD COLUMN <column name>"
 */
function addColumn(db, log, table, columnDdl, label = null) {
  const migration = label || `ADD COLUMN ${columnDdl.split(' ')[0]}`
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDdl}`)
  } catch (error) {
    if (!error.message.includes('duplicate column') && !error.message.includes('already exists')) {
      log.warn('Migration warning', { migration, error: error.message })
    }
  }
}

/**
 * Run schema migrations in order. Each step is idempotent.
 * @param {Object} db - better-sqlite3 database handle
 * @param {Object} log - logger instance
 */
export function runMigrations(db, log) {
  addColumn(db, log, 'todos', 'importance INTEGER DEFAULT NULL')
  addColumn(db, log, 'todos', 'start_date TEXT')
  addColumn(db, log, 'todos', 'status_id INTEGER')

  // Migration: rename deadline to end_date. The data copy must only run when
  // the column is newly added, so this step stays outside addColumn.
  try {
    db.exec('ALTER TABLE todos ADD COLUMN end_date TEXT')
    // Migrate data from deadline to end_date
    db.exec('UPDATE todos SET end_date = deadline WHERE deadline IS NOT NULL AND end_date IS NULL')
  } catch (error) {
    if (!error.message.includes('duplicate column') && !error.message.includes('already exists')) {
      log.warn('Migration warning', { migration: 'ADD COLUMN end_date', error: error.message })
    }
  }

  // Soft delete (trashbin) timestamps
  addColumn(db, log, 'todos', 'deleted_at TEXT', 'ADD COLUMN deleted_at to todos')
  addColumn(db, log, 'projects', 'deleted_at TEXT', 'ADD COLUMN deleted_at to projects')

  // Migration: drop categories table
  try {
    db.exec('DROP TABLE IF EXISTS categories')
  } catch (error) {
    log.warn('Migration warning', { migration: 'DROP TABLE categories', error: error.message })
  }

  // Recurrence fields
  addColumn(db, log, 'todos', 'recurrence_type TEXT')
  addColumn(db, log, 'todos', 'recurrence_interval INTEGER DEFAULT 1')
  addColumn(db, log, 'todos', 'recurrence_end_date TEXT')

  // Note: a previous migration nulled importance = 3 on every startup to undo
  // an old default. importance = 3 is now a valid user value ("Medium"), and
  // the historical default is no longer distinguishable from a user-set value,
  // so that migration was removed to stop destroying legitimate data. The
  // column default is NULL (see ADD COLUMN importance above), so new todos are
  // unaffected.

  addColumn(db, log, 'todos', 'notes_sensitive INTEGER DEFAULT 0')
  // Todo vs note distinction
  addColumn(db, log, 'todos', "type TEXT DEFAULT 'todo'")
  // Milestone hierarchy
  addColumn(db, log, 'todos', 'parent_id INTEGER REFERENCES todos(id) ON DELETE SET NULL')
  addColumn(db, log, 'todos', 'milestone_date TEXT')
  // Project-specific topic buckets
  addColumn(db, log, 'todos', 'topic_id INTEGER REFERENCES project_topics(id) ON DELETE SET NULL')
  addColumn(db, log, 'todos', 'completed_at TEXT')
  addColumn(db, log, 'todos', 'archived_at TEXT')
  // Remembers the project a todo was detached from when that project was
  // moved to the trash, so restoring the project can reattach it
  addColumn(db, log, 'todos', 'deleted_project_id INTEGER')
  // Persistent per-project notes
  addColumn(db, log, 'projects', "notes TEXT DEFAULT ''", 'ADD COLUMN notes to projects')

  repairStaleCategoryFk(db, log)
}

/**
 * Rebuild the todos table when its definition still references the dropped
 * categories table.
 *
 * Databases created before the category feature was removed carry a
 * FOREIGN KEY clause pointing at categories, which a later migration drops.
 * The clause breaks every write to todos as soon as SQLite foreign-key
 * enforcement is enabled, so the table is rebuilt without it (and without
 * the category_id column) following SQLite's table-rebuild procedure.
 * Runs after all column migrations so the table already has the full
 * current column set.
 *
 * @param {Object} db - better-sqlite3 database handle
 * @param {Object} log - logger instance
 */
function repairStaleCategoryFk(db, log) {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'todos'")
    .get()
  if (!row || !/categories/i.test(row.sql)) {
    return
  }

  // With enforcement on, DROP TABLE todos would fire ON DELETE CASCADE in
  // todo_links, milestone_items and todo_tags. The pragma is a no-op inside a
  // transaction, so it is switched off around it and restored afterwards.
  const fkWasOn = db.pragma('foreign_keys', { simple: true }) === 1
  if (fkWasOn) db.pragma('foreign_keys = OFF')
  try {
    db.transaction(() => {
      db.exec(`CREATE TABLE todos_rebuild (${TODOS_COLUMNS_DDL})`)
      const targetColumns = db.pragma('table_info(todos_rebuild)').map((c) => c.name)
      const sourceColumns = new Set(db.pragma('table_info(todos)').map((c) => c.name))
      const copyColumns = targetColumns.filter((c) => sourceColumns.has(c)).join(', ')
      db.exec(`INSERT INTO todos_rebuild (${copyColumns}) SELECT ${copyColumns} FROM todos`)
      db.exec('DROP TABLE todos')
      db.exec('ALTER TABLE todos_rebuild RENAME TO todos')
      // Enforcement was never on in older databases, so orphans may predate
      // the rebuild; report them rather than refuse to start.
      const violations = db.pragma('foreign_key_check')
      if (violations.length > 0) {
        log.warn(`todos rebuild: ${violations.length} pre-existing foreign key violations`)
      }
    })()
  } finally {
    if (fkWasOn) db.pragma('foreign_keys = ON')
  }
  log.info('Rebuilt todos table to remove stale categories foreign key')
}

/**
 * Check that the tables the code relies on contain the expected columns.
 *
 * @param {Object} db - better-sqlite3 database handle
 * @throws {Error} Naming every missing column, with recovery guidance.
 */
export function verifySchema(db) {
  const missing = []
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const present = new Set(db.pragma(`table_info(${table})`).map((c) => c.name))
    for (const column of columns) {
      if (!present.has(column)) {
        missing.push(`${table}.${column}`)
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Database schema is missing required columns: ${missing.join(', ')}. ` +
        'Restore a backup from next to the database file, or use ' +
        'Settings > Reset Database to start fresh.'
    )
  }
}
