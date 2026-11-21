// A release candidate is published as a prerelease, so installed apps do not
// update to it (docs/auto-update.md).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')
const updater = readFileSync(new URL('../src/main/updater.js', import.meta.url), 'utf8')

describe('release candidates', () => {
  it('the release workflow publishes a suffixed tag as a prerelease', () => {
    expect(workflow).toMatch(/\*-\*/)
    expect(workflow).toMatch(/--prerelease/)
  })

  it('the updater does not opt into prereleases', () => {
    expect(updater).not.toMatch(/allowPrerelease\s*=\s*true/)
  })
})
