import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/preset-route.ts'
import { CLAUDE_CODE_PROVIDER } from '../src/constants.ts'
import { recordClaudeModels, resetClaudeModels } from '../src/model-catalog.ts'

type RequestListener = (payload: unknown, next: () => Promise<{ provider?: string; model?: string }>) => Promise<{ provider?: string; model?: string }>

type CreatedListener = (payload: { agent: unknown }) => void

function capture(jobs?: { attachController(name: string): () => void }): { ctx: Context; listener: () => RequestListener; created: () => CreatedListener; registered: () => readonly string[]; provided: () => { name: string; value: unknown } | undefined } {
  let listener: RequestListener = () => { throw new Error('unregistered') }
  let created: CreatedListener = () => { throw new Error('unregistered') }
  const names: string[] = []
  let service: { name: string; value: unknown } | undefined
  const ctx = {
    on: (event: string, handler: RequestListener | CreatedListener) => {
      if (event === 'agent/created') {
        created = handler as CreatedListener
      } else {
        expect(event).toBe('agent/request')
        listener = handler as RequestListener
      }
    },
    get: (name: string) => name === 'agentPresets'
      ? { composedPreset: () => 'claude' }
      : undefined,
    effect: (setup: () => unknown) => { setup() },
    // Optional-service inject: the callback runs only when the Host has it.
    inject: (names: readonly string[], setup: (scoped: unknown) => void) => {
      expect(names).toEqual(['jobs'])
      if (jobs !== undefined) setup({ jobs, effect: (run: () => unknown) => { run() } })
    },
    provide: (name: string, value: unknown) => { service = { name, value } },
    tools: {
      register: (definition: { name: string }) => {
        names.push(definition.name)
        return () => undefined
      },
    },
  } as unknown as Context
  return { ctx, listener: () => listener, created: () => created, registered: () => names, provided: () => service }
}

describe('Claude preset route', () => {
  it('sets the Claude model before step preparation on Hosts exposing agent.model', async () => {
    const captured = capture()
    const selected: Array<{ provider: string; model: string }> = []
    apply(captured.ctx)
    const agent = {
      ctx: {},
      model: {
        current: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-pro' }),
        select: (selection: { provider: string; model: string }) => { selected.push(selection) },
      },
    }
    captured.created()({ agent })
    expect(selected).toEqual([{ provider: CLAUDE_CODE_PROVIDER, model: 'default' }])
    // Once the Host has agent.model, never rewrite its prepared request.
    const upstream = { provider: 'claude', model: 'default' }
    expect(await captured.listener()({ agent }, async () => upstream)).toBe(upstream)
  })

  it('keeps the legacy fallback for another Agent after a modern Agent has been created', async () => {
    const captured = capture()
    apply(captured.ctx)
    const modern = {
      ctx: {},
      model: { current: () => ({ provider: 'claude', model: 'opus' }), select: () => undefined },
    }
    captured.created()({ agent: modern })

    const modernRequest = { provider: CLAUDE_CODE_PROVIDER, model: 'opus', reasoningEffort: 'high' }
    expect(await captured.listener()({ agent: modern }, async () => modernRequest)).toBe(modernRequest)

    // An older Agent without agent.model must not inherit a plugin-wide
    // "modern" flag from another Session.
    const legacyRequest = { provider: 'upstream', model: 'sonnet' }
    expect(await captured.listener()({ agent: { ctx: {} } }, async () => legacyRequest))
      .toEqual({ provider: CLAUDE_CODE_PROVIDER, model: 'sonnet' })
  })

  it('preserves an already selected Claude model on a modern Host', () => {
    const captured = capture()
    const selected: unknown[] = []
    apply(captured.ctx)
    captured.created()({
      agent: {
        ctx: {},
        model: {
          current: () => ({ provider: 'claude', model: 'opus' }),
          select: (selection: unknown) => { selected.push(selection) },
        },
      },
    })
    expect(selected).toEqual([])
  })

  it('honors an explicit Claude model override through the public model control', () => {
    const captured = capture()
    const selected: unknown[] = []
    apply(captured.ctx, { model: 'sonnet' })
    captured.created()({
      agent: {
        ctx: {},
        model: {
          current: () => ({ provider: 'claude', model: 'opus' }),
          select: (selection: unknown) => { selected.push(selection) },
        },
      },
    })
    expect(selected).toEqual([{ provider: 'claude', model: 'sonnet' }])
  })

  it('preserves the upstream selected model alias', async () => {
    const captured = capture()
    apply(captured.ctx)
    const result = await captured.listener()({} as never, async () => ({ provider: 'upstream-provider', model: 'opus' }))
    expect(result).toEqual({ provider: CLAUDE_CODE_PROVIDER, model: 'opus' })
  })

  it('defaults to default when upstream carries no model', async () => {
    const captured = capture()
    apply(captured.ctx)
    const result = await captured.listener()({} as never, async () => ({ provider: 'upstream-provider' }))
    expect(result).toEqual({ provider: CLAUDE_CODE_PROVIDER, model: 'default' })
  })

  it('lets explicit route config override the upstream selection', async () => {
    const captured = capture()
    apply(captured.ctx, { model: 'sonnet' })
    const result = await captured.listener()({} as never, async () => ({ provider: 'upstream-provider', model: 'opus' }))
    expect(result).toEqual({ provider: CLAUDE_CODE_PROVIDER, model: 'sonnet' })
  })

  it('registers presentation-only tool mirrors into the preset scope', () => {
    const captured = capture()
    apply(captured.ctx)
    expect(captured.registered()).toEqual([
      'Bash', 'PowerShell', 'Read', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit',
      'Grep', 'Glob', 'WebSearch', 'WebFetch', 'Task', 'ExitPlanMode', 'TodoWrite',
    ])
  })

  it('provides only the agent-scope command directory for collision checks', () => {
    const captured = capture()
    apply(captured.ctx)
    const service = captured.provided()
    expect(service?.name).toBe('claudeCommands')
    expect(typeof (service?.value as { list?: unknown }).list).toBe('function')
    expect((service?.value as { register?: unknown }).register).toBeUndefined()
  })

  it('attaches a job controller for its agents when the Host has a job registry', () => {
    const attached: string[] = []
    apply(capture({ attachController: name => { attached.push(name); return () => undefined } }).ctx)
    expect(attached).toEqual(['dsh-claude'])
  })

  it('records the selector id for a model the lineup maps, and leaves an unmapped one alone', async () => {
    recordClaudeModels([
      { value: 'opus[1m]', displayName: 'Opus (1M context)', description: '' },
      { value: 'claude-fable-5-1[1m]', displayName: 'Fable', description: '' },
    ])
    const captured = capture()
    apply(captured.ctx)
    const route = (model: string) => captured.listener()({} as never, async () => ({ provider: 'claude', model }))
    await expect(route('claude-fable-5-1[1m]')).resolves.toMatchObject({ model: 'fable[1m]' })
    await expect(route('claude-fable-5-2[1m]')).resolves.toMatchObject({ model: 'fable[1m]' })
    await expect(route('opus[1m]')).resolves.toMatchObject({ model: 'opus[1m]' })
    await expect(route('something-else')).resolves.toMatchObject({ model: 'something-else' })
    resetClaudeModels()
  })

  it('backs a provider-qualified model off to the default instead of persisting it', async () => {
    recordClaudeModels([{ value: 'claude-fable-5-1', displayName: 'Fable', description: '' }])
    const captured = capture()
    apply(captured.ctx)
    const route = (model: string) => captured.listener()({} as never, async () => ({ provider: 'dsh-fe', model }))
    await expect(route('dsh-fe/deepseek-v4-flash:high[1m]')).resolves.toMatchObject({ model: 'default' })
    await expect(route('magpie/auto-gpt')).resolves.toMatchObject({ model: 'default' })
    resetClaudeModels()
  })

  it('keeps a provider-prefixed model the CLI lineup actually lists', async () => {
    // A gateway-backed lineup offers `auto/…`, `cursor/…`, `giikin/…` entries.
    // They carry a slash but are the user's real choice; backing them off would
    // quietly run the default model instead.
    recordClaudeModels([
      { value: 'auto/claude-opus-5-5', displayName: 'Claude Opus 5.5', description: '' },
      { value: 'giikin/gemini-4-argon[1m]', displayName: 'Gemini 4 Argon', description: '' },
    ])
    const captured = capture()
    apply(captured.ctx)
    const route = (model: string) => captured.listener()({} as never, async () => ({ provider: 'claude', model }))
    const opus = await route('auto/claude-opus-5-5')
    expect(opus.model).not.toBe('default')
    expect(opus.model).toContain('/')
    const gemini = await route('giikin/gemini-4-argon[1m]')
    expect(gemini.model).not.toBe('default')
    resetClaudeModels()
  })
})
