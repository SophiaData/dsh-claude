import { describe, expect, it } from 'vitest'
import { isClaudeProvider, providerAllowedForPreset } from '../src/model-selection.ts'

describe('model selection by preset', () => {
  it('knows which provider route is Claude Code', () => {
    expect(isClaudeProvider('claude')).toBe(true)
    expect(isClaudeProvider('dsh-fe')).toBe(false)
  })

  it('offers a Claude session the Claude lineup alone', () => {
    expect(providerAllowedForPreset('claude', 'claude')).toBe(true)
    // A DSH model picked under the Claude preset bypasses the Claude request
    // route, so it is not merely noise.
    expect(providerAllowedForPreset('claude', 'dsh-fe')).toBe(false)
  })

  it('offers every other preset the rest', () => {
    expect(providerAllowedForPreset('standard', 'claude')).toBe(false)
    expect(providerAllowedForPreset('standard', 'dsh-fe')).toBe(true)
  })

  it('filters nothing before the preset settles', () => {
    expect(providerAllowedForPreset(undefined, 'claude')).toBe(true)
    expect(providerAllowedForPreset(undefined, 'dsh-fe')).toBe(true)
  })
})
