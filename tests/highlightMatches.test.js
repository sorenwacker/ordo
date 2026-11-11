// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { highlightMatches, clearHighlights } from '../src/renderer/utils/highlightMatches.js'

function container(html) {
  const el = document.createElement('div')
  el.innerHTML = html
  return el
}

describe('highlightMatches', () => {
  it('wraps every case-insensitive match in a mark and returns them in order', () => {
    const el = container('<p>Alpha beta</p><p>ALPHA <strong>alpha</strong></p>')
    const marks = highlightMatches(el, 'alpha')
    expect(marks.map((m) => m.textContent)).toEqual(['Alpha', 'ALPHA', 'alpha'])
    expect(el.querySelector('strong mark')).not.toBeNull()
  })

  it('finds several matches inside one text node', () => {
    const el = container('<p>ab ab ab</p>')
    expect(highlightMatches(el, 'ab')).toHaveLength(3)
    expect(el.textContent).toBe('ab ab ab')
  })

  it('treats the query as literal text, not markup or a pattern', () => {
    const el = container('<p>a.b <b>x</b> a+b</p>')
    expect(highlightMatches(el, '<b>')).toHaveLength(0)
    expect(highlightMatches(el, 'a+b')).toHaveLength(1)
  })

  it('returns no marks for an empty query', () => {
    const el = container('<p>text</p>')
    expect(highlightMatches(el, '')).toEqual([])
    expect(el.querySelector('mark')).toBeNull()
  })

  it('clearHighlights restores the original markup', () => {
    const html = '<p>one <em>two</em> one</p>'
    const el = container(html)
    highlightMatches(el, 'one')
    clearHighlights(el)
    expect(el.innerHTML).toBe(html)
  })

  it('replaces earlier highlights on a new query', () => {
    const el = container('<p>cat dog</p>')
    highlightMatches(el, 'cat')
    const marks = highlightMatches(el, 'dog')
    expect(marks.map((m) => m.textContent)).toEqual(['dog'])
    expect(el.querySelectorAll('mark')).toHaveLength(1)
  })
})
