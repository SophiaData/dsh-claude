// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import {
  locateClaudeRewindSeats,
  removeClaudeRewindSeats,
  sameClaudeRewindSeats,
} from '../src/client/rewind-dom.ts'

afterEach(() => {
  removeClaudeRewindSeats()
  document.body.innerHTML = ''
})

describe('Claude rewind portal host selection', () => {
  it('adds seats only for message keys from the active Claude session', () => {
    document.body.innerHTML = `
      <section data-session="native">
        <article data-chat-flow-kind="user" data-chat-flow-key="native-user">
          <div class="message-actions"><button>Copy native</button></div>
        </article>
      </section>
      <section data-session="claude">
        <article data-chat-flow-kind="user" data-chat-flow-key="claude-user">
          <div class="message-actions"><button id="copy-claude">Copy Claude</button></div>
        </article>
      </section>`
    const eligible = new Set(['claude-user'])
    const found = locateClaudeRewindSeats(eligible)
    expect(found.map(seat => seat.key)).toEqual(['claude-user'])
    expect(found[0]?.host.nextElementSibling?.id).toBe('copy-claude')
    expect(document.querySelector('[data-session="native"] [data-dsh-claude-rewind]')).toBeNull()
    const repeated = locateClaudeRewindSeats(eligible)
    expect(sameClaudeRewindSeats(found, repeated)).toBe(true)
    expect(document.querySelectorAll('[data-dsh-claude-rewind]')).toHaveLength(1)
  })

  it('never injects into message text that happens to have an actions CSS fragment', () => {
    document.body.innerHTML = `
      <article data-chat-flow-kind="user" data-chat-flow-key="claude-user">
        <div class="user-actions-description"><span>A message about actions</span></div>
        <div class="_actions_42"><button id="copy">Copy</button></div>
      </article>`
    const found = locateClaudeRewindSeats(new Set(['claude-user']))
    expect(found).toHaveLength(1)
    expect(found[0]?.host.parentElement?.className).toBe('_actions_42')
    expect(document.querySelector('.user-actions-description [data-dsh-claude-rewind]')).toBeNull()
  })

  it('fails open instead of adding a toolbar when the Host copy button is unavailable', () => {
    document.body.innerHTML = `
      <article data-chat-flow-kind="user" data-chat-flow-key="claude-user">
        <div class="_actions_42"><span>Actions pending</span></div>
      </article>`
    expect(locateClaudeRewindSeats(new Set(['claude-user']))).toEqual([])
    expect(document.querySelector('[data-dsh-claude-rewind]')).toBeNull()
  })

  it('does not inject into unrelated sessions when chat node keys change', () => {
    document.body.innerHTML = `
      <article data-chat-flow-kind="user" data-chat-flow-key="former-claude">
        <div class="_actions_42"><button>Copy old</button></div>
      </article>
      <article data-chat-flow-kind="user" data-chat-flow-key="active-claude">
        <div class="_actions_42"><button>Copy active</button></div>
      </article>`
    expect(locateClaudeRewindSeats(new Set(['active-claude'])).map(seat => seat.key))
      .toEqual(['active-claude'])
    expect(document.querySelector('[data-chat-flow-key="former-claude"] [data-dsh-claude-rewind]')).toBeNull()
    removeClaudeRewindSeats()
    expect(document.querySelectorAll('[data-dsh-claude-rewind]')).toHaveLength(0)
  })
})
