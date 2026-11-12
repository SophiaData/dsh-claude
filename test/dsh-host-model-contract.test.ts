/** Runtime compatibility tests against the installed DSH packages.
 *
 * Unlike a structural fake of agent.model, these exercise the published
 * dsh-agent AgentModel implementation and a real dsh-session event log.
 *
 * A full DSH Desktop lifecycle / native Claude CLI run still requires an
 * external Host smoke test; these tests check the critical package boundary.
 */
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { AgentModel, modelSelectionProjectionDefinition } from '@deepseek-ai/dsh-agent'
import { Session } from '@deepseek-ai/dsh-session'
import { apply, type Config } from '../src/preset-route.ts'
import { CLAUDE_CODE_PROVIDER } from '../src/constants.ts'
import { publicModelControl } from '../src/preset-model-sync.ts'

function newSession(id: string): Session {
  return Session.create(id as Parameters<typeof Session.create>[0])
}

function realModel(session: Session, fallback: { provider: string; model: string }): AgentModel {
  // Use the actual Host projection fold instead of a mock state assignment:
  // a selection reaches current() only through a committed session event.
  return new AgentModel(
    () => session.snapshotEvents().reduce(
      (state, event) => modelSelectionProjectionDefinition.apply(state, event),
      modelSelectionProjectionDefinition.init(),
    ),
    session,
    fallback,
  )
}

type Hook = (...args: never[]) => unknown
interface TestAgent {
  ctx: { preset: string }
  model: AgentModel
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

describe('real DSH Session / AgentModel contract', () => {
  it('records a durable model/selection on creation before the model request', async () => {
    const session = newSession('dsh-host-new-claude')
    const model = realModel(session, { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
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
    realModel(original, { provider: 'claude', model: 'default' })
      .select({ provider: CLAUDE_CODE_PROVIDER, model: 'opus' })

    // Seed a second real Session from its recorded events. This exercises
    // replay in dsh-session, not the Desktop persistence backend or UI.
    const replayed = Session.create(original.id, original.snapshotEvents())
    const model = realModel(replayed, { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
    const agent: TestAgent = { ctx: { preset: 'claude' }, session: replayed, model }
    expect(model.current()).toMatchObject({ provider: CLAUDE_CODE_PROVIDER, model: 'opus' })
    const before = countSelections(replayed)
    mountedRoute().created(agent)
    expect(model.current()).toMatchObject({ provider: CLAUDE_CODE_PROVIDER, model: 'opus' })
    expect(countSelections(replayed)).toBe(before)
  })

  it('keeps non-Claude Agent selection untouched by a Claude preset creation listener', () => {
    const session = newSession('dsh-host-native')
    const model = realModel(session, { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
    const agent: TestAgent = { ctx: { preset: 'native' }, session, model }
    mountedRoute().created(agent)
    expect(model.current()).toMatchObject({ provider: 'deepseek-official', model: 'deepseek-v4-pro' })
    expect(countSelections(session)).toBe(0)
  })

  it('honors configured override and records it with the real DSH projection', () => {
    const session = newSession('dsh-host-configured')
    const model = realModel(session, { provider: CLAUDE_CODE_PROVIDER, model: 'opus' })
    mountedRoute({ model: 'sonnet' }).created({ ctx: { preset: 'claude' }, session, model })
    expect(model.current()).toMatchObject({ provider: CLAUDE_CODE_PROVIDER, model: 'sonnet' })
    expect(countSelections(session)).toBe(1)
  })
})
