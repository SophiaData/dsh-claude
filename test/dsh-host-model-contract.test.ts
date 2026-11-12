/** Runtime compatibility tests against the installed DSH packages.
 *
 * These exercise the published DSH Session event log and the plugin's public
 * agent.model structural contract. The pinned rc.5 agent module does not
 * export AgentModel as a runtime constructor; the adapter below only models
 * the public surface and cannot certify the actual Host driver.
 *
 * A full DSH Desktop lifecycle / native Claude CLI run remains a manual gate.
 */
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import * as dshAgent from '@deepseek-ai/dsh-agent'
import { Session } from '@deepseek-ai/dsh-session'
import { apply, type Config } from '../src/preset-route.ts'
import { CLAUDE_CODE_PROVIDER } from '../src/constants.ts'
import { publicModelControl } from '../src/preset-model-sync.ts'

function newSession(id: string): Session {
  return Session.create(id as Parameters<typeof Session.create>[0])
}

interface Selection { provider: string; model: string; reasoningEffort?: string }
interface ModelControl {
  current(): Selection | undefined
  select(selection: Selection): void
}

/** The locked rc.5 package does not export a runtime AgentModel constructor,
 * even though newer DSH source does. Use the real DSH Session event log for
 * durable selection tests, and a minimal public-model contract adapter. A
 * conditional canary exercises the real AgentModel when the installed
 * package exports it. This prevents false claims of full Host integration.
 */
function sessionModel(session: Session, fallback: Selection): ModelControl {
  const recorded = (): Selection | undefined => {
    const events = session.snapshotEvents()
    for (let i = events.length - 1; i >= 0; --i) {
      const event = events[i]
      if (event?.type === 'model/selection') return event.data as Selection
    }
    return undefined
  }
  return {
    current: () => recorded() ?? fallback,
    select: selection => {
      const existing = recorded()
      if (existing?.provider === selection.provider && existing.model === selection.model
        && existing.reasoningEffort === selection.reasoningEffort) return
      session.append('model/selection', selection)
    },
  }
}

type Hook = (...args: never[]) => unknown
interface TestAgent {
  ctx: { preset: string }
  model: ModelControl
  session: Session
}

function mountedRoute(config?: Config) {
  const hooks = new Map<string, Hook>()
  const ctx = {
    on: (name: string, callback: Hook) => {
      hooks.set(name, callback)
      return () => { hooks.delete(name) }
    },
    get: (name: string) => name === 'agentPresets'
      ? { composedPreset: (scope: TestAgent['ctx']) => scope.preset }
      : undefined,
    tools: { register: () => () => undefined },
    commands: { list: () => [] },
    provide: () => undefined,
    effect: (register: () => unknown) => { register() },
    inject: () => undefined,
  } as unknown as Context
  apply(ctx, config)

  return {
    created: (agent: TestAgent) => {
      const handler = hooks.get('agent/created')
      expect(handler).toBeTypeOf('function')
      return handler?.({ agent, source: 'startup' } as never)
    },
    request: async (agent: TestAgent, upstream: { provider: string; model: string; reasoningEffort?: string }) => {
      const handler = hooks.get('agent/request')
      expect(handler).toBeTypeOf('function')
      return await handler?.({ agent, turn: 1, step: 1, signal: new AbortController().signal } as never, (async () => upstream) as never)
    },
  }
}

function countSelections(session: Session): number {
  return session.snapshotEvents().filter(event => event.type === 'model/selection').length
}

describe('real DSH Session event / public model-control contract', () => {
  it('detects whether this pinned Host exports the actual AgentModel runtime constructor', () => {
    // This is a capability report, not a hard-coded assertion about a newer
    // upstream source tree. A newer lockfile makes the canary eligible.
    const value: unknown = Reflect.get(dshAgent, 'AgentModel')
    expect(value === undefined || typeof value === 'function').toBe(true)
    expect(typeof Session.create).toBe('function')
  })

  it('records a durable model/selection on creation before the model request', async () => {
    const session = newSession('dsh-host-new-claude')
    const model = sessionModel(session, { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
    const agent: TestAgent = { ctx: { preset: 'claude' }, session, model }
    const route = mountedRoute()

    expect(publicModelControl(agent)).toBe(model)
    expect(model.current()).toMatchObject({ provider: 'deepseek-official', model: 'deepseek-v4-pro' })
    expect(countSelections(session)).toBe(0)

    route.created(agent)
    expect(model.current()).toMatchObject({ provider: CLAUDE_CODE_PROVIDER, model: 'default' })
    expect(countSelections(session)).toBe(1)
    const entry = session.snapshotEvents().find(event => event.type === 'model/selection')
    expect(entry?.data).toMatchObject({ provider: CLAUDE_CODE_PROVIDER, model: 'default' })

    // The step's selected route is fixed before agent/request is invoked.
    const prepared = { provider: CLAUDE_CODE_PROVIDER, model: 'default', reasoningEffort: 'high' }
    expect(await route.request(agent, prepared)).toBe(prepared)
    expect(countSelections(session)).toBe(1)
  })

  it('keeps a recorded Claude model when a Session is reconstructed', () => {
    const original = newSession('dsh-host-resume')
    sessionModel(original, { provider: 'claude', model: 'default' })
      .select({ provider: CLAUDE_CODE_PROVIDER, model: 'opus' })

    // Seed a second real Session from its recorded events. The model-control
    // adapter is structural: actual replay is provided by dsh-session, not
    // the Desktop persistence backend or live AgentModel driver.
    const replayed = Session.create(original.id, original.snapshotEvents())
    const model = sessionModel(replayed, { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
    const agent: TestAgent = { ctx: { preset: 'claude' }, session: replayed, model }
    expect(model.current()).toMatchObject({ provider: CLAUDE_CODE_PROVIDER, model: 'opus' })
    const before = countSelections(replayed)
    mountedRoute().created(agent)
    expect(model.current()).toMatchObject({ provider: CLAUDE_CODE_PROVIDER, model: 'opus' })
    expect(countSelections(replayed)).toBe(before)
  })

  it('keeps non-Claude Agent selection untouched by a Claude preset creation listener', () => {
    const session = newSession('dsh-host-native')
    const model = sessionModel(session, { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
    const agent: TestAgent = { ctx: { preset: 'native' }, session, model }
    mountedRoute().created(agent)
    expect(model.current()).toMatchObject({ provider: 'deepseek-official', model: 'deepseek-v4-pro' })
    expect(countSelections(session)).toBe(0)
  })

  it.skipIf(typeof Reflect.get(dshAgent, 'AgentModel') !== 'function'
    || typeof Reflect.get(dshAgent, 'modelSelectionProjectionDefinition') !== 'object')(
    'exercises the native AgentModel constructor when this Host package exposes it', () => {
      const AgentModelCtor = Reflect.get(dshAgent, 'AgentModel') as new (
        reader: () => unknown,
        session: Session,
        options: Selection,
      ) => ModelControl
      const definition = Reflect.get(dshAgent, 'modelSelectionProjectionDefinition') as {
        init(): unknown
        apply(state: unknown, event: unknown): unknown
      }
      const session = newSession('dsh-host-agent-model-native-canary')
      const model = new AgentModelCtor(
        () => session.snapshotEvents().reduce(
          (state, event) => definition.apply(state, event), definition.init(),
        ),
        session,
        { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
      )
      expect(model.current()).toMatchObject({ provider: 'deepseek-official', model: 'deepseek-v4-pro' })
      model.select({ provider: CLAUDE_CODE_PROVIDER, model: 'sonnet' })
      expect(model.current()).toMatchObject({ provider: CLAUDE_CODE_PROVIDER, model: 'sonnet' })
      expect(countSelections(session)).toBe(1)
    },
  )

  it('honors configured override and records it in the real DSH Session', () => {
    const session = newSession('dsh-host-configured')
    const model = sessionModel(session, { provider: CLAUDE_CODE_PROVIDER, model: 'opus' })
    mountedRoute({ model: 'sonnet' }).created({ ctx: { preset: 'claude' }, session, model })
    expect(model.current()).toMatchObject({ provider: CLAUDE_CODE_PROVIDER, model: 'sonnet' })
    expect(countSelections(session)).toBe(1)
  })
})
