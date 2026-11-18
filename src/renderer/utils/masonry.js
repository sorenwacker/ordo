/**
 * Masonry for the cards grid.
 *
 * CSS grid has no masonry mode yet (Chromium 148 keeps it behind a flag), so
 * the grid is given 1px implicit rows in CSS and every card spans as many of
 * them as its rendered height needs; with `align-items: start` each column
 * then packs on its own. A ResizeObserver per card keeps the span right: it
 * reports once when the card is first laid out and again whenever its height
 * changes (notes expanded, title wrapped, window resized), after layout and
 * before paint. Nothing has to guess when content has finished rendering.
 */

/**
 * Rows a card of `height` px must span when every row is `rowUnit` px tall
 * and rows are `gap` px apart.
 *
 * @param {number} height Rendered height of the card, border box.
 * @param {number} rowUnit Height of one implicit grid row.
 * @param {number} gap Row gap of the grid.
 * @returns {number} Span, at least 1.
 */
export function rowSpan(height, rowUnit, gap) {
  // N rows cover N * rowUnit + (N - 1) * gap pixels.
  return Math.max(1, Math.ceil((height + gap) / (rowUnit + gap)))
}

/** Set `card`'s grid row span to fit `height` in the grid it sits in. */
function fitToRows(card, height) {
  const grid = card.parentElement
  if (!grid) return
  const style = window.getComputedStyle(grid)
  const rowUnit = parseFloat(style.gridAutoRows)
  if (style.display !== 'grid' || !(rowUnit > 0)) {
    // Not a row-spanning grid, e.g. a column of cards stacked with flex.
    card.style.gridRowEnd = ''
    return
  }
  card.style.gridRowEnd = `span ${rowSpan(height, rowUnit, parseFloat(style.rowGap) || 0)}`
}

let observer = null

function observe(card) {
  // jsdom, where the component tests run, has no ResizeObserver.
  if (typeof ResizeObserver === 'undefined') return
  observer ??= new ResizeObserver((entries) => {
    for (const entry of entries) {
      const height =
        entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height
      fitToRows(entry.target, height)
    }
  })
  observer.observe(card)
}

/**
 * `v-masonry-item`: keeps the element's grid row span equal to its rendered
 * height for as long as it is mounted. On a component it binds to the
 * component's root element.
 */
export const masonryItem = {
  mounted: observe,
  unmounted(card) {
    observer?.unobserve(card)
    card.style.gridRowEnd = ''
  }
}
