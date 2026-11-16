import { CLAUDE_MODEL_PATH, CLAUDE_MODELS_PATH } from '../constants.ts'
import type { ClaudeModelCatalogView, ClaudeModelOption, ClaudeModelSelectionView } from '../model-selection.ts'
import { pluginRead, pluginWrite } from './plugin-transport.ts'

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function option(value: unknown): ClaudeModelOption | undefined {
  const row = record(value)
  if (row === undefined) return undefined
  const { provider, providerName, id, name, description } = row
  if (typeof provider !== 'string' || typeof providerName !== 'string' || typeof id !== 'string' || typeof name !== 'string') return undefined
  return { provider, providerName, id, name, ...(typeof description === 'string' && description.length > 0 ? { description } : {}) }
}

function selection(value: unknown): ClaudeModelSelectionView | undefined {
  const row = record(value)
  if (row === undefined || typeof row.provider !== 'string' || typeof row.model !== 'string') return undefined
  return { provider: row.provider, model: row.model, ...(typeof row.name === 'string' ? { name: row.name } : {}) }
}

/** The selector catalog for one Session: its preset's models and its current pick.
 *  `key` overrides the in-flight coalescing identity; a caller that must not
 *  join an earlier read of the same URL (a preset change re-reading under the
 *  old, about-to-be-aborted request) carries its own. */
export async function loadClaudeModelCatalog(sessionId: string, signal?: AbortSignal, key?: string): Promise<ClaudeModelCatalogView> {
  const payload = record(await pluginRead<unknown>(CLAUDE_MODELS_PATH, 'fast', signal, {
    query: { sessionId },
    ...(key === undefined ? {} : { key }),
  }))
  if (payload === undefined || !Array.isArray(payload.rows)) throw new Error('Invalid model catalog result.')
  return {
    ...(typeof payload.preset === 'string' ? { preset: payload.preset } : {}),
    current: payload.current === null ? null : selection(payload.current) ?? null,
    rows: payload.rows.map(option).filter((row): row is ClaudeModelOption => row !== undefined),
  }
}

/** Record one model as the Session's selection. */
export async function selectClaudeModel(sessionId: string, provider: string, model: string, signal?: AbortSignal): Promise<void> {
  await pluginWrite<unknown>(CLAUDE_MODEL_PATH, 'fast', signal, { json: { sessionId, provider, model } })
}
