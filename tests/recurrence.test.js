import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { unlinkSync, existsSync } from 'fs'
import { Database, addRecurrenceStep } from '../src/main/database.js'

describe('addRecurrenceStep', () => {
  it('steps days and weeks', () => {
    expect(addRecurrenceStep('2026-03-25', 'daily', 3)).toBe('2026-03-28')
    expect(addRecurrenceStep('2026-03-25', 'weekly', 1)).toBe('2026-04-01')
  })

  it('clamps monthly and yearly steps to the end of the month', () => {
    expect(addRecurrenceStep('2026-01-31', 'monthly', 1)).toBe('2026-02-28')
    expect(addRecurrenceStep('2028-01-31', 'monthly', 1)).toBe('2028-02-29')
    expect(addRecurrenceStep('2028-02-29', 'yearly', 1)).toBe('2029-02-28')
    expect(addRecurrenceStep('2026-11-15', 'monthly', 2)).toBe('2027-01-15')
  })

  it('returns null for an unknown type', () => {
    expect(addRecurrenceStep('2026-01-01', 'hourly', 1)).toBeNull()
  })
})

describe('createNextRecurrence across a DST change', () => {
  const originalTz = process.env.TZ
  let db
  let dbPath

  beforeEach(() => {
    process.env.TZ = 'Europe/Berlin'
    dbPath = join(tmpdir(), `test-recur-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
    db = new Database(dbPath)
  })

  afterEach(() => {
    db.close()
    for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      if (existsSync(f)) unlinkSync(f)
    }
    process.env.TZ = originalTz
  })

  it('keeps the weekly due date and start span on the right day', () => {
    const todo = db.createTodo('Weekly', null)
    db.updateTodo({
      ...db.getTodo(todo.id),
      end_date: '2026-03-25',
      start_date: '2026-03-23',
      recurrence_type: 'weekly',
      recurrence_interval: 1
    })

    const next = db.createNextRecurrence(todo.id)

    expect(next.end_date).toBe('2026-04-01')
    expect(next.start_date).toBe('2026-03-30')
  })
})
