import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { migrateLegacyUserData } from '../src/main/legacyData.js'

// Renaming the app changes Electron's userData directory, which is derived
// from productName. Without this migration the renamed app opens an empty
// database beside the user's real one and every todo appears to be gone.
let root, legacyPath, userDataPath

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ordo-migrate-'))
  legacyPath = join(root, 'todo')
  userDataPath = join(root, 'ordo')
  mkdirSync(legacyPath, { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function seedLegacyDatabase(contents = 'legacy-database') {
  writeFileSync(join(legacyPath, 'todos.db'), contents)
}

describe('migrateLegacyUserData', () => {
  it('copies the database when the new location is empty', () => {
    seedLegacyDatabase()

    const result = migrateLegacyUserData({ userDataPath, legacyPath })

    expect(result.migrated).toBe(true)
    expect(result.files).toContain('todos.db')
    expect(readFileSync(join(userDataPath, 'todos.db'), 'utf8')).toBe('legacy-database')
  })

  it('carries the write-ahead log and shared memory files across', () => {
    seedLegacyDatabase()
    writeFileSync(join(legacyPath, 'todos.db-wal'), 'wal')
    writeFileSync(join(legacyPath, 'todos.db-shm'), 'shm')

    const result = migrateLegacyUserData({ userDataPath, legacyPath })

    expect(result.files).toEqual(expect.arrayContaining(['todos.db', 'todos.db-wal', 'todos.db-shm']))
    expect(existsSync(join(userDataPath, 'todos.db-wal'))).toBe(true)
    expect(existsSync(join(userDataPath, 'todos.db-shm'))).toBe(true)
  })

  it('carries existing backups across so recovery still works', () => {
    seedLegacyDatabase()
    writeFileSync(join(legacyPath, 'todos-backup-2026-01-30.db'), 'backup')
    writeFileSync(join(legacyPath, 'todos-premigrate-2026-02-01.db'), 'premigrate')

    const result = migrateLegacyUserData({ userDataPath, legacyPath })

    expect(existsSync(join(userDataPath, 'todos-backup-2026-01-30.db'))).toBe(true)
    expect(existsSync(join(userDataPath, 'todos-premigrate-2026-02-01.db'))).toBe(true)
    expect(result.files).toHaveLength(3)
  })

  it('leaves the legacy directory intact so an older build still opens', () => {
    seedLegacyDatabase()

    migrateLegacyUserData({ userDataPath, legacyPath })

    expect(existsSync(join(legacyPath, 'todos.db'))).toBe(true)
  })

  it('refuses to overwrite a database already in the new location', () => {
    seedLegacyDatabase()
    mkdirSync(userDataPath, { recursive: true })
    writeFileSync(join(userDataPath, 'todos.db'), 'current-database')

    const result = migrateLegacyUserData({ userDataPath, legacyPath })

    expect(result.migrated).toBe(false)
    expect(result.reason).toBe('target-exists')
    expect(readFileSync(join(userDataPath, 'todos.db'), 'utf8')).toBe('current-database')
  })

  it('does nothing when there is no legacy database to migrate', () => {
    const result = migrateLegacyUserData({ userDataPath, legacyPath })

    expect(result.migrated).toBe(false)
    expect(result.reason).toBe('no-legacy-data')
    expect(existsSync(join(userDataPath, 'todos.db'))).toBe(false)
  })

  it('does nothing when the legacy directory is the new directory', () => {
    seedLegacyDatabase()

    const result = migrateLegacyUserData({ userDataPath: legacyPath, legacyPath })

    expect(result.migrated).toBe(false)
    expect(result.reason).toBe('same-directory')
  })
})
