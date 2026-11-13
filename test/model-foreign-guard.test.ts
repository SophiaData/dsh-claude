import { afterEach, describe, expect, it } from 'vitest'
import {
  ensureClaudeModels,
  isForeignClaudeModelId,
  recordClaudeModels,
  resetClaudeModels,
} from '../src/model-catalog.ts'

afterEach(() => { resetClaudeModels() })

describe('isForeignClaudeModelId', () => {
  it('backs an unlisted slash id off once the lineup is known', () => {
    recordClaudeModels([{ value: 'claude-fable-5-1', displayName: 'Fable', description: '' }])
    expect(isForeignClaudeModelId('dsh-fe/deepseek-v4-flash')).toBe(true)
    expect(isForeignClaudeModelId('auto/claude-opus-5-5')).toBe(true)
  })

  it('keeps a slash id the CLI lineup lists', () => {
    recordClaudeModels([{ value: 'auto/claude-opus-5-5', displayName: 'Opus', description: '' }])
    expect(isForeignClaudeModelId('auto/claude-opus-5-5')).toBe(false)
  })

  it('does not fold a slash id while the boot probe is still in flight', async () => {
    let resolveProbe!: (models: readonly { value: string; displayName: string; description: string }[]) => void
    const probe = new Promise<readonly { value: string; displayName: string; description: string }[]>(resolve => {
      resolveProbe = resolve
    })
    const loading = ensureClaudeModels(() => probe)
    expect(isForeignClaudeModelId('auto/claude-opus-5-5')).toBe(false)
    expect(isForeignClaudeModelId('dsh-fe/deepseek-v4-flash')).toBe(false)
    resolveProbe([{ value: 'auto/claude-opus-5-5', displayName: 'Opus', description: '' }])
    await loading
    expect(isForeignClaudeModelId('auto/claude-opus-5-5')).toBe(false)
    expect(isForeignClaudeModelId('dsh-fe/deepseek-v4-flash')).toBe(true)
  })

  it('folds unlisted slash ids again after a failed boot probe', async () => {
    const loading = ensureClaudeModels(async () => { throw new Error('probe failed') })
    expect(isForeignClaudeModelId('dsh-fe/deepseek-v4-flash')).toBe(false)
    await loading
    expect(isForeignClaudeModelId('dsh-fe/deepseek-v4-flash')).toBe(true)
  })
})
