import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const STYLES = resolve(import.meta.dirname, '../src/renderer/styles')
const css = ['panels.css', 'responsive.css']
  .map((file) => readFileSync(resolve(STYLES, file), 'utf8'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

// Widths that come from the browser or from a component prop rather than from a
// stylesheet, measured in Chrome against the real card markup.
const CHECKBOX_WIDTH = 16
const ICON_BUTTON_WIDTH = 22 // lucide icon at :size="14" plus 4px padding either side
const HEADER_GAPS = 3 // checkbox | title | archive | delete

// A title narrower than this wraps to a couple of characters per line, which is
// the failure the floor exists to prevent.
const MIN_TITLE_WIDTH = 110

/**
 * Bodies of every rule whose selector is exactly `selector`, in source order,
 * including the ones nested in media queries.
 */
function blocksFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(?:^|[{};])\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g')
  return [...css.matchAll(pattern)].map((match) => match[1])
}

/**
 * First pixel value declared for `property` across the given rule bodies.
 */
function px(blocks, property) {
  for (const block of blocks) {
    const match = block.match(new RegExp(`(?:^|;)\\s*${property}\\s*:([^;]*)`))
    if (match) {
      const value = match[1].match(/(\d+(?:\.\d+)?)px/)
      if (value) return Number(value[1])
    }
  }
  return null
}

/**
 * Every pixel value declared for `property` across the given rule bodies.
 */
function allPx(blocks, property) {
  return blocks
    .map((block) => {
      const match = block.match(new RegExp(`(?:^|;)\\s*${property}\\s*:([^;]*)`))
      const value = match?.[1].match(/(\d+(?:\.\d+)?)px/)
      return value ? Number(value[1]) : null
    })
    .filter((value) => value !== null)
}

describe('kanban column width', () => {
  const columnBlocks = blocksFor('.kanban-column')
  const cardBlocks = blocksFor('.kanban-card')
  const headerBlocks = blocksFor('.card-header')

  // Everything in a card header except the title is fixed width and does not
  // shrink, so it is spent before the title gets any space.
  const furniture =
    2 * px(columnBlocks, 'padding') +
    2 * px(cardBlocks, 'padding') +
    px(cardBlocks, 'border-left') +
    CHECKBOX_WIDTH +
    2 * ICON_BUTTON_WIDTH +
    HEADER_GAPS * px(headerBlocks, 'gap')

  it('reads the furniture widths back out of the stylesheets', () => {
    expect(px(columnBlocks, 'padding')).toBe(16)
    expect(px(cardBlocks, 'padding')).toBe(12)
    expect(px(cardBlocks, 'border-left')).toBe(3)
    expect(px(headerBlocks, 'gap')).toBe(10)
    expect(furniture).toBe(149)
  })

  it('declares a column floor at every breakpoint that uses one', () => {
    expect(allPx(columnBlocks, 'min-width').length).toBeGreaterThan(0)
  })

  it('leaves the card title a readable width at every column floor', () => {
    for (const floor of allPx(columnBlocks, 'min-width')) {
      expect(floor - furniture).toBeGreaterThanOrEqual(MIN_TITLE_WIDTH)
    }
  })

  // A ceiling on column width leaves an empty strip on the right of a wide
  // window whenever there are few columns; columns share the board instead.
  it('declares no column ceiling at any breakpoint', () => {
    expect(allPx(columnBlocks, 'max-width')).toEqual([])
  })
})

/**
 * Every (selector, body) pair in the stylesheets. Media query wrappers fall out
 * on their own: their body contains a nested block, so it never matches.
 */
function allRules() {
  const dir = readdirSync(STYLES).filter((file) => file.endsWith('.css'))
  const text = dir
    .map((file) => readFileSync(resolve(STYLES, file), 'utf8'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((match) => match[1].trim())
    .filter((selector) => !selector.startsWith('@'))
    .flatMap((selector) => selector.split(',').map((part) => part.trim()))
}

describe('kanban card styling', () => {
  const template = readFileSync(
    resolve(import.meta.dirname, '../src/renderer/components/KanbanCard.vue'),
    'utf8'
  ).split('</template>')[0]

  // Static class attributes on the kanban card's own markup.
  const classes = [
    ...new Set(
      [...template.matchAll(/(?:^|\s)class="([^"]+)"/g)].flatMap((match) => match[1].split(/\s+/))
    )
  ].filter(Boolean)

  const selectors = allRules()

  it('finds the card sub-element classes in the template', () => {
    expect(classes).toContain('card-dates-info')
    expect(classes).toContain('card-meta')
  })

  // A kanban card is not a .todo-card, so a rule scoped that way never reaches
  // it. A class styled only in that scope renders unstyled on the board -- which
  // is how the dates row lost its gap, its size and its colour.
  it('never styles a kanban card class only within the cards view scope', () => {
    const cardsViewOnly = classes.filter((name) => {
      const mentions = selectors.filter((selector) =>
        new RegExp(`\\.${name}(?![\\w-])`).test(selector)
      )
      return mentions.length > 0 && mentions.every((selector) => selector.includes('.todo-card'))
    })

    expect(cardsViewOnly).toEqual([])
  })
})
