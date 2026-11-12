// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { HOST_CHROME_CSS } from '../src/client/host-chrome.ts'

afterEach(() => {
  document.head.querySelectorAll('style[data-test-claude-host-chrome]').forEach(style => style.remove())
  document.body.innerHTML = ''
})

/** Exercise the actual CSS selectors against a mixed Host DOM. Test matching,
 * not jsdom's incomplete layout implementation of display:none. */
function suppressionSelectors(): string[] {
  const style = document.createElement('style')
  style.setAttribute('data-test-claude-host-chrome', '')
  style.textContent = HOST_CHROME_CSS
  document.head.appendChild(style)
  return Array.from(style.sheet?.cssRules ?? [])
    .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
    .filter(rule => /sessionLogButton|moreButton/u.test(rule.selectorText))
    .map(rule => rule.selectorText)
}

describe('Host session-export chrome isolation', () => {
  it('matches both legacy and new export buttons in a Claude header only', () => {
    document.body.innerHTML = `
      <header id="claude">
        <button class="dsh-claude-header-diff">Diff</button>
        <button class="_sessionLogButton_hash">Export old</button>
        <button class="_moreButton_hash" aria-haspopup="menu">Export new</button>
      </header>
      <header id="native">
        <button class="_sessionLogButton_hash">Export old</button>
        <button class="_moreButton_hash" aria-haspopup="menu">Export new</button>
      </header>`
    const selectors = suppressionSelectors()
    expect(selectors).toHaveLength(2)
    for (const selector of selectors) {
      const matched = Array.from(document.querySelectorAll(selector))
      expect(matched).toHaveLength(1)
      expect(matched[0]?.closest('header')?.id).toBe('claude')
    }
  })

  it('fails open if the Claude-specific ownership marker is missing', () => {
    document.body.innerHTML = `
      <header><button class="_sessionLogButton_hash">Export</button></header>
      <header><button class="_moreButton_hash" aria-haspopup="menu">More</button></header>`
    for (const selector of suppressionSelectors()) {
      expect(document.querySelectorAll(selector)).toHaveLength(0)
    }
  })

  it('does not hide a native session export after the Claude header disappears', () => {
    document.body.innerHTML = `
      <header id="claude"><span class="dsh-claude-header-diff"></span><button class="_moreButton_hash" aria-haspopup="menu">More</button></header>
      <header id="native"><button class="_moreButton_hash" aria-haspopup="menu">More</button></header>`
    const selectors = suppressionSelectors()
    expect(selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)))).toHaveLength(1)
    document.getElementById('claude')?.remove()
    for (const selector of selectors) expect(document.querySelectorAll(selector)).toHaveLength(0)
    expect(document.querySelector('#native button')).not.toBeNull()
  })
})
