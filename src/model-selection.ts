import { CLAUDE_CODE_PRESET_ID, CLAUDE_CODE_PROVIDER_IDS } from './constants.ts'

/** One provider's membership rule for the model selector.
 *
 *  The plugin registers the Claude Code provider globally, so every Session's
 *  native model catalog carries the whole Claude lineup. Presets are what decide
 *  which side a Session runs, so the selector is drawn from the preset: a
 *  Claude Session lists Claude models alone, and every other Session lists the
 *  rest. A mismatch is not only noise — a Claude Session that selected a DSH
 *  model bypasses the Claude request route, and a non-Claude Session that
 *  selected one fails its turn. */
export function isClaudeProvider(provider: string): boolean {
  return (CLAUDE_CODE_PROVIDER_IDS as readonly string[]).includes(provider)
}

/**
 * Whether one provider's models belong in the selector for a Session's preset.
 * @param preset - the Session's composed preset, or `undefined` before it settles.
 * @param provider - the provider route the models belong to.
 * @returns whether the provider's models are offered.
 */
export function providerAllowedForPreset(preset: string | undefined, provider: string): boolean {
  // Before composition there is no side to filter to; showing everything for
  // that one frame is the Host's own behaviour, and the route lets the pick
  // through for the same reason.
  if (preset === undefined) return true
  return isClaudeProvider(provider) === (preset === CLAUDE_CODE_PRESET_ID)
}

export interface ClaudeModelOption {
  readonly provider: string
  readonly providerName: string
  readonly id: string
  readonly name: string
  readonly description?: string
}

export interface ClaudeModelSelectionView {
  readonly provider: string
  readonly model: string
  /** The catalog's name for the selection; absent when the catalog no longer lists it. */
  readonly name?: string
}

export interface ClaudeModelCatalogView {
  readonly preset?: string
  /** The Session's current selection, independent of the preset filter. */
  readonly current: ClaudeModelSelectionView | null
  readonly rows: readonly ClaudeModelOption[]
}
