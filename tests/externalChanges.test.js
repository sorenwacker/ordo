import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { unlinkSync, existsSync } from 'fs'
import { Database } from '../src/main/database.js'
import { startExternalChangeWatcher } from '../src/main/externalChanges.js'

// The MCP server writes to the database from its own process while the app
// is running. The app must notice those commits without a restart, and it
// must not reload for its own writes. A directory watch cannot do this on
// macOS (see docs/mcp-server.md), so the watcher polls SQLite's data_version.

describe('startExternalChangeWatcher', () => {
  const POLL = 1000
  let testDbPath
  let appDb
  let otherDb
  let onChange
  let stop

  beforeEach(() => {
    vi.useFakeTimers()
    testDbPath = join(tmpdir(), `test-ext-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
    appDb = new Database(testDbPath)
    otherDb = new Database(testDbPath)
    onChange = vi.fn()
    stop = null
  })

  afterEach(() => {
    if (stop) stop()
    appDb.close()
    otherDb.close()
    for (const suffix of ['', '-wal', '-shm']) {
      if (existsSync(testDbPath + suffix)) unlinkSync(testDbPath + suffix)
    }
    vi.useRealTimers()
  })

  it('reports a commit made by another connection at the next poll', () => {
    stop = startExternalChangeWatcher({ database: appDb, onChange, intervalMs: POLL })
    otherDb.createProject('From the server', '#0f9d58')
    expect(onChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(POLL)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it("does not report the application's own writes", () => {
    stop = startExternalChangeWatcher({ database: appDb, onChange, intervalMs: POLL })
    appDb.createProject('From the app', '#0f9d58')
    vi.advanceTimersByTime(POLL * 3)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('reports once per poll however many commits happened in between', () => {
    stop = startExternalChangeWatcher({ database: appDb, onChange, intervalMs: POLL })
    otherDb.createProject('One', '#0f9d58')
    otherDb.createProject('Two', '#0f9d58')
    otherDb.createProject('Three', '#0f9d58')
    vi.advanceTimersByTime(POLL)
    expect(onChange).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(POLL * 3)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('reports each later external commit separately', () => {
    stop = startExternalChangeWatcher({ database: appDb, onChange, intervalMs: POLL })
    otherDb.createProject('One', '#0f9d58')
    vi.advanceTimersByTime(POLL)
    otherDb.createProject('Two', '#0f9d58')
    vi.advanceTimersByTime(POLL)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('stops polling once stopped', () => {
    stop = startExternalChangeWatcher({ database: appDb, onChange, intervalMs: POLL })
    stop()
    stop = null
    otherDb.createProject('After stop', '#0f9d58')
    vi.advanceTimersByTime(POLL * 3)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps polling after a failed read', () => {
    const versions = [1, new Error('database is locked'), 2]
    const database = {
      getDataVersion: vi.fn(() => {
        const next = versions.shift()
        if (next instanceof Error) throw next
        return next ?? 2
      })
    }
    const log = { warn: vi.fn() }
    stop = startExternalChangeWatcher({ database, onChange, intervalMs: POLL, log })
    vi.advanceTimersByTime(POLL)
    expect(log.warn).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(POLL)
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
