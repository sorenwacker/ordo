/**
 * Highlighting of search matches in already-rendered HTML. Matches are wrapped
 * in <mark> elements inside the text nodes, so the markup is never rewritten
 * as a string and a query can never inject or break tags. See docs/fullscreen.md.
 */

/**
 * Remove every <mark> added by highlightMatches, restoring the original text nodes.
 * @param {HTMLElement} root - Container that was highlighted.
 */
export function clearHighlights(root) {
  for (const mark of root.querySelectorAll('mark[data-search-match]')) {
    mark.replaceWith(document.createTextNode(mark.textContent))
  }
  root.normalize()
}

/**
 * Highlight all case-insensitive occurrences of a literal query.
 * @param {HTMLElement} root - Container holding rendered notes.
 * @param {string} query - Text to find; empty clears all highlights.
 * @returns {HTMLElement[]} The <mark> elements in document order.
 */
export function highlightMatches(root, query) {
  clearHighlights(root)
  if (!query) return []
  const needle = query.toLowerCase()
  const walker = document.createTreeWalker(root, window.NodeFilter.SHOW_TEXT)
  const textNodes = []
  while (walker.nextNode()) textNodes.push(walker.currentNode)

  const marks = []
  for (const node of textNodes) {
    const text = node.nodeValue
    const lower = text.toLowerCase()
    let index = lower.indexOf(needle)
    if (index < 0) continue
    const fragment = document.createDocumentFragment()
    let last = 0
    while (index >= 0) {
      if (index > last) fragment.append(text.slice(last, index))
      const mark = document.createElement('mark')
      mark.dataset.searchMatch = ''
      mark.textContent = text.slice(index, index + needle.length)
      fragment.append(mark)
      marks.push(mark)
      last = index + needle.length
      index = lower.indexOf(needle, last)
    }
    if (last < text.length) fragment.append(text.slice(last))
    node.replaceWith(fragment)
  }
  return marks
}
