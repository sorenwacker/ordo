import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'os'
import { join, dirname, basename } from 'path'
import { unlinkSync, readdirSync } from 'fs'
import BetterSqlite3 from 'better-sqlite3'
import { Database } from '../src/main/database.js'
import { SCHEMA_VERSION, createTables, runMigrations } from '../src/main/schema.js'

// Exercises the version-stamp, refuse-newer, pre-migration-backup, legacy
// FK repair, and schema verification behavior documented in
// docs/database-compatibility.md.

// Schema of a database created before the category feature was removed:
// todos carries a foreign key to categories, which later app versions drop.
const LEGACY_SCHEMA = `
  CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#0f4c75',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    symbol TEXT DEFAULT '*',
    sort_order INTEGER DEFAULT 0
  );
  CREATE TABLE todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    notes TEXT DEFAULT '',
    deadline TEXT,
    completed INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    importance INTEGER DEFAULT NULL,
    project_id INTEGER,
    category_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
  );
  INSERT INTO categories (name) VALUES ('Work');
  INSERT INTO todos (title, notes, category_id) VALUES ('Legacy task', 'kept', 1);
`

describe('Schema compatibility', () => {
  let testDbPath
  let db

  beforeEach(() => {
    testDbPath = join(
      tmpdir(),
      `test-compat-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    )
    db = null
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
    // Remove the db and any premigrate backups created next to it
    const dir = dirname(testDbPath)
    const prefix = basename(testDbPath).replace(/\.db$/, '')
    for (const file of readdirSync(dir)) {
      if (file.startsWith(prefix)) {
        unlinkSync(join(dir, file))
      }
    }
  })

  const premigrateBackups = () => {
    const dir = dirname(testDbPath)
    const prefix = basename(testDbPath).replace(/\.db$/, '')
    return readdirSync(dir).filter((f) => f.startsWith(`${prefix}-premigrate-`))
  }

  describe('Version stamping', () => {
    it('stamps a fresh database with the current schema version', () => {
      db = new Database(testDbPath)
      expect(db.db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
    })

    it('does not create a premigrate backup for a fresh database', () => {
      db = new Database(testDbPath)
      expect(premigrateBackups()).toHaveLength(0)
    })

    it('backs up and stamps an existing unstamped database', () => {
      db = new Database(testDbPath)
      db.createTodo('Existing task')
      db.close()

      const raw = new BetterSqlite3(testDbPath)
      raw.pragma('user_version = 0')
      raw.close()
      db = new Database(testDbPath)

      expect(db.db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
      expect(db.getAllTodos()).toHaveLength(1)
      expect(premigrateBackups()).toHaveLength(1)
    })

    it('does not create another backup when the version already matches', () => {
      db = new Database(testDbPath)
      db.close()
      db = new Database(testDbPath)
      expect(premigrateBackups()).toHaveLength(0)
    })
  })

  describe('Newer databases', () => {
    it('refuses to open a database stamped by a newer app version', () => {
      const raw = new BetterSqlite3(testDbPath)
      raw.pragma(`user_version = ${SCHEMA_VERSION + 1}`)
      raw.close()

      expect(() => new Database(testDbPath)).toThrow(/newer version/)
    })

    it('writes nothing to a newer database when refusing it', () => {
      const raw = new BetterSqlite3(testDbPath)
      raw.pragma(`user_version = ${SCHEMA_VERSION + 1}`)
      raw.close()

      expect(() => new Database(testDbPath)).toThrow()

      const check = new BetterSqlite3(testDbPath)
      const tables = check.prepare("SELECT COUNT(*) AS n FROM sqlite_master").get().n
      check.close()
      expect(tables).toBe(0)
      expect(premigrateBackups()).toHaveLength(0)
    })
  })

  describe('Legacy category foreign key repair', () => {
    beforeEach(() => {
      const raw = new BetterSqlite3(testDbPath)
      raw.exec(LEGACY_SCHEMA)
      raw.close()
    })

    it('removes the stale foreign key and column from todos', () => {
      db = new Database(testDbPath)

      const ddl = db.db
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'todos'")
        .get().sql
      expect(ddl).not.toMatch(/categories/i)
      const columns = db.db.pragma('table_info(todos)').map((c) => c.name)
      expect(columns).not.toContain('category_id')
    })

    it('preserves todo data through the rebuild', () => {
      db = new Database(testDbPath)

      const todos = db.getAllTodos()
      expect(todos).toHaveLength(1)
      expect(todos[0].title).toBe('Legacy task')
      expect(todos[0].notes).toBe('kept')
    })

    it('keeps todo links when the repair runs with foreign key enforcement on', () => {
      const raw = new BetterSqlite3(testDbPath)
      createTables(raw)
      raw.prepare('INSERT INTO todos (title) VALUES (?)').run('Second task')
      raw.prepare('INSERT INTO todo_links (source_id, target_id) VALUES (1, 2)').run()
      raw.pragma('foreign_keys = ON')
      runMigrations(raw, { info() {}, warn() {}, error() {} })

      expect(raw.pragma('foreign_keys', { simple: true })).toBe(1)
      expect(raw.prepare('SELECT COUNT(*) AS n FROM todo_links').get().n).toBe(1)
      raw.close()
    })

    it('keeps todos writable even with foreign key enforcement enabled', () => {
      db = new Database(testDbPath)
      db.close()
      db = null

      const raw = new BetterSqlite3(testDbPath)
      raw.pragma('foreign_keys = ON')
      expect(() => raw.prepare('INSERT INTO todos (title) VALUES (?)').run('New task')).not.toThrow()
      raw.close()
    })

    it('keeps the pre-repair state in a premigrate backup', () => {
      db = new Database(testDbPath)

      const backups = premigrateBackups()
      expect(backups).toHaveLength(1)
      const backup = new BetterSqlite3(join(dirname(testDbPath), backups[0]))
      const columns = backup.pragma('table_info(todos)').map((c) => c.name)
      backup.close()
      expect(columns).toContain('category_id')
    })
  })

  describe('Schema verification', () => {
    it('rejects a stamped database that is missing a required column', () => {
      db = new Database(testDbPath)
      db.close()
      db = null

      const raw = new BetterSqlite3(testDbPath)
      raw.exec('ALTER TABLE todos DROP COLUMN archived_at')
      raw.close()

      expect(() => new Database(testDbPath)).toThrow(/archived_at/)
    })
  })
})
