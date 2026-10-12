import { describe, it, expect } from 'vitest'
import { openCount } from '../src/renderer/utils/counts.js'

describe('openCount', () => {
  it('is the total less the completed', () => {
    expect(openCount({ done: 3, total: 8 })).toBe(5)
  })

  it('is zero for a fully completed count', () => {
    expect(openCount({ done: 8, total: 8 })).toBe(0)
  })

  it('is zero when there is no count yet', () => {
    expect(openCount(undefined)).toBe(0)
  })
})
