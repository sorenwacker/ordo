import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Each platform job of the release workflow uploads with electron-builder,
// which creates a draft release when none exists for the tag. Three jobs
// racing on a fresh tag therefore produced three partial drafts. The
// workflow must create the draft once before the builds and publish it once
// after them; these checks fail if either stage is dropped or unordered.
const workflow = readFileSync(join(import.meta.dirname, '../.github/workflows/release.yml'), 'utf8')

function job(name) {
  const match = workflow.match(
    new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  \\w[\\w-]*:\\n|(?![\\s\\S]))`, 'm')
  )
  return match ? match[1] : null
}

describe('release workflow', () => {
  it('creates the draft release in a job of its own before the builds', () => {
    const create = job('create-release')
    expect(create).not.toBeNull()
    expect(create).toMatch(/gh release create .*--draft/)
    expect(job('build')).toMatch(/needs: create-release/)
  })

  it('publishes the draft once all platform builds have uploaded', () => {
    const publish = job('publish-release')
    expect(publish).not.toBeNull()
    expect(publish).toMatch(/needs: build/)
    expect(publish).toMatch(/gh release edit .*--draft=false/)
    expect(publish).toMatch(/--latest/)
  })
})
