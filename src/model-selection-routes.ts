import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { CLAUDE_CODE_PROVIDER, CLAUDE_MODEL_PATH, CLAUDE_MODELS_PATH } from './constants.ts'
import { registerPluginRoute, type PluginRouteIo } from './http.ts'
import { canonicalClaudeModelId } from './model-catalog.ts'
import { providerAllowedForPreset, type ClaudeModelCatalogView, type ClaudeModelOption, type ClaudeModelSelectionView } from './model-selection.ts'

const MAX_BODY_BYTES = 4 * 1024
const MAX_SESSION_ID_CHARS = 1_024
const MAX_PROVIDER_CHARS = 128
const MAX_MODEL_CHARS = 256

/** The Host faces this route needs; every one is a call the plugin already
 *  makes elsewhere, passed in rather than reached for through the Context so
 *  the route stays testable without a mounted Host. */
export interface ClaudeModelAccess {
  /** Whether the Host still holds the Session. */
  hasSession: (sessionId: string) => boolean
  /** The Session's composed preset; `undefined` until composition settles. */
  presetOf: (sessionId: string) => string | undefined
  /** Registered provider routes, in selector order. */
  providers: () => readonly ClaudeModelProvider[]
  /** One provider's discoverable models. */
  models: (provider: string) => Promise<readonly ClaudeModelInfo[]>
  /** The Session's current selection, when it has one. */
  current: (sessionId: string) => { provider: string; model: string } | undefined
  /** Record a selection through the Host's own writer. */
  select: (sessionId: string, selection: { provider: string; model: string }) => Promise<void>
}

export interface ClaudeModelProvider {
  readonly id: string
  readonly name: string
}

export interface ClaudeModelInfo {
  readonly id: string
  readonly name: string
  readonly description?: string
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

async function readJson(io: PluginRouteIo): Promise<Record<string, unknown> | undefined> {
  // A malformed body is this route's 400. Every other read failure — an
  // oversized body above all — is the wrapper's to answer, so it is rethrown
  // rather than folded into the same 400.
  try {
    return record(await io.body<unknown>(MAX_BODY_BYTES))
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

function bounded(value: unknown, maxChars: number): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= maxChars ? value : undefined
}

/** One provider's catalog, bounded: a provider that never answers costs the
 *  selector its own rows, not the whole list. */
const PROVIDER_CATALOG_BUDGET_MS = 2_000

async function boundedModels(access: ClaudeModelAccess, provider: string): Promise<readonly ClaudeModelInfo[]> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<readonly ClaudeModelInfo[]>(resolve => {
    timer = setTimeout(() => { resolve([]) }, PROVIDER_CATALOG_BUDGET_MS)
    timer.unref?.()
  })
  // `models` is wrapped, not called bare: an implementation that throws
  // synchronously must cost this provider its rows, not reject the batch.
  const listing = Promise.resolve().then(() => access.models(provider)).catch(() => [])
  try {
    return await Promise.race([listing, expired])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

async function catalogOf(access: ClaudeModelAccess, preset: string | undefined): Promise<readonly ClaudeModelOption[]> {
  const providers = access.providers().filter(provider => providerAllowedForPreset(preset, provider.id))
  // Providers are asked side by side: a slow one must not stack its wait onto
  // the next one's, and the whole list must not outlive the route's budget.
  const listings = await Promise.all(providers.map(async provider => ({
    provider,
    models: await boundedModels(access, provider.id),
  })))
  const rows: ClaudeModelOption[] = []
  for (const { provider, models } of listings) {
    for (const model of models) {
      rows.push({
        provider: provider.id,
        providerName: provider.name,
        id: model.id,
        name: model.name,
        ...(model.description === undefined || model.description.length === 0 ? {} : { description: model.description }),
      })
    }
  }
  return rows
}

async function currentView(access: ClaudeModelAccess, sessionId: string, rows: readonly ClaudeModelOption[]): Promise<ClaudeModelSelectionView | null> {
  const current = access.current(sessionId)
  if (current === undefined) return null
  const listed = rows.find(row => row.provider === current.provider && row.id === current.model)
  if (listed !== undefined) return { provider: current.provider, model: current.model, name: listed.name }
  // A selection the preset filter hides (a Session mid-switch) still needs its
  // label; ask only the provider it names, on the same bounded read.
  const models = await boundedModels(access, current.provider)
  const name = models.find(model => model.id === current.model)?.name
  return { provider: current.provider, model: current.model, ...(name === undefined ? {} : { name }) }
}

/** `GET <path>?sessionId=…`: the model catalog this Session's preset may pick
 *  from, plus its current selection. `POST <path>` with
 *  `{ sessionId, provider, model }`: record one, refusing a provider the
 *  preset does not run. */
export function registerClaudeModelRoute(ctx: Context, access: ClaudeModelAccess): void {
  registerPluginRoute(ctx, {
    mode: 'unary',
    kind: 'exact',
    path: CLAUDE_MODELS_PATH,
    methods: ['GET'],
    // The catalog comes from the Host's in-memory provider registry.
    budget: 'fast',
    handler: async io => {
      const sessionId = bounded(io.url.searchParams.get('sessionId'), MAX_SESSION_ID_CHARS)
      if (sessionId === undefined) return { status: 400, value: { error: 'invalid-request' } }
      if (!access.hasSession(sessionId)) return { status: 404, value: { error: 'session-unavailable' } }
      const preset = access.presetOf(sessionId)
      const rows = await catalogOf(access, preset)
      const value: ClaudeModelCatalogView = {
        ...(preset === undefined ? {} : { preset }),
        current: await currentView(access, sessionId, rows),
        rows,
      }
      return { status: 200, value }
    },
  })
  registerPluginRoute(ctx, {
    mode: 'unary',
    kind: 'exact',
    path: CLAUDE_MODEL_PATH,
    methods: ['POST'],
    // One Host selection write and the Session-log append it makes.
    budget: 'fast',
    handler: async io => {
      // A malformed body reads as no input and fails the 400 below; an
      // oversized one rethrows to the wrapper's 413.
      const input = await readJson(io)
      const sessionId = bounded(input?.sessionId, MAX_SESSION_ID_CHARS)
      const provider = bounded(input?.provider, MAX_PROVIDER_CHARS)
      const model = bounded(input?.model, MAX_MODEL_CHARS)
      if (sessionId === undefined || provider === undefined || model === undefined) {
        return { status: 400, value: { error: 'invalid-request' } }
      }
      if (!access.hasSession(sessionId)) return { status: 404, value: { error: 'session-unavailable' } }
      const preset = access.presetOf(sessionId)
      // A settled preset owns the answer. Before composition there is nothing
      // to contradict, and the request route guards the dispatch anyway.
      if (preset !== undefined && !providerAllowedForPreset(preset, provider)) {
        return { status: 409, value: { error: 'preset-provider-mismatch' } }
      }
      const selection = {
        provider,
        model: provider === CLAUDE_CODE_PROVIDER ? canonicalClaudeModelId(model) : model,
      }
      try {
        await access.select(sessionId, selection)
      } catch (error) {
        return {
          status: 409,
          value: { error: 'selection-failed', message: error instanceof Error ? error.message : String(error) },
        }
      }
      return { status: 200, value: selection }
    },
  })
}
