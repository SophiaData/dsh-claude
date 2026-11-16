import { Readable } from 'node:stream'
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { CLAUDE_MODEL_PATH, CLAUDE_MODELS_PATH } from '../src/constants.ts'
import { registerClaudeModelRoute, type ClaudeModelAccess, type ClaudeModelProvider } from '../src/model-selection-routes.ts'

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

const HOST = 'localhost:56454'

function context(): Context & { handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>()
  return Object.assign({ handlers } as { handlers: Map<string, Handler> }, {
    logger: { warn: vi.fn() },
    effect: (register: () => unknown) => {
      const route = register() as { path: string; handler: Handler }
      handlers.set(route.path, route.handler)
    },
    webServer: {
      register: (route: { path: string; handler: Handler }) => {
        expect(route.path === CLAUDE_MODELS_PATH || route.path === CLAUDE_MODEL_PATH).toBe(true)
        return route
      },
    },
  }) as unknown as Context & { handlers: Map<string, Handler> }
}

function request(method: 'GET' | 'POST', url: string, body?: unknown): IncomingMessage {
  const text = body === undefined ? '' : JSON.stringify(body)
  const stream = Readable.from([Buffer.from(text)])
  return {
    method,
    url,
    headers: body === undefined
      ? { host: HOST, origin: `http://${HOST}` }
      : { host: HOST, origin: `http://${HOST}`, 'content-length': String(Buffer.byteLength(text)) },
    socket: { remoteAddress: '::1' },
    on() { return this },
    [Symbol.asyncIterator]: () => stream[Symbol.asyncIterator](),
  } as unknown as IncomingMessage
}

function response(): ServerResponse & { statusCode: number; body: string } {
  return {
    statusCode: 0,
    body: '',
    headersSent: false,
    writableEnded: false,
    on() { return this },
    once() { return this },
    off() { return this },
    setHeader() { return this },
    flushHeaders() {},
    write(chunk: string) { this.body += chunk; return true },
    writeHead(status: number) { this.statusCode = status; this.headersSent = true; return this },
    end(body?: string) { this.writableEnded = true; if (body !== undefined) this.body += body },
  } as unknown as ServerResponse & { statusCode: number; body: string }
}

const PROVIDERS: readonly ClaudeModelProvider[] = [
  { id: 'claude', name: 'Claude Code' },
  { id: 'dsh-fe', name: 'DSH' },
]

const MODELS: Readonly<Record<string, readonly { id: string; name: string; description?: string }[]>> = {
  claude: [
    { id: 'default', name: 'Default (recommended)' },
    { id: 'opus', name: 'Opus', description: 'Deepest reasoning' },
  ],
  'dsh-fe': [{ id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' }],
}

function access(overrides: Partial<ClaudeModelAccess> = {}): ClaudeModelAccess {
  return {
    hasSession: () => true,
    presetOf: () => 'claude',
    providers: () => PROVIDERS,
    models: async provider => MODELS[provider] ?? [],
    current: () => ({ provider: 'claude', model: 'opus' }),
    select: async () => {},
    ...overrides,
  }
}

async function get(ctx: Context & { handlers: Map<string, Handler> }, sessionId: string) {
  const res = response()
  await ctx.handlers.get(CLAUDE_MODELS_PATH)?.(request('GET', `${CLAUDE_MODELS_PATH}?sessionId=${encodeURIComponent(sessionId)}`), res)
  return { status: res.statusCode, value: JSON.parse(res.body) as Record<string, unknown> }
}

async function post(ctx: Context & { handlers: Map<string, Handler> }, body: unknown) {
  const res = response()
  await ctx.handlers.get(CLAUDE_MODEL_PATH)?.(request('POST', CLAUDE_MODEL_PATH, body), res)
  return { status: res.statusCode, value: JSON.parse(res.body) as Record<string, unknown> }
}

describe('model selection routes', () => {
  it('offers a Claude session the Claude lineup alone', async () => {
    const ctx = context()
    registerClaudeModelRoute(ctx, access())
    const { status, value } = await get(ctx, 'session-1')
    expect(status).toBe(200)
    expect(value.preset).toBe('claude')
    expect((value.rows as { provider: string; id: string }[]).map(row => row.provider)).toEqual(['claude', 'claude'])
    expect(value.current).toEqual({ provider: 'claude', model: 'opus', name: 'Opus' })
  })

  it('offers every other preset the rest and nothing from Claude Code', async () => {
    const ctx = context()
    registerClaudeModelRoute(ctx, access({ presetOf: () => 'standard', current: () => ({ provider: 'dsh-fe', model: 'deepseek-v4-flash' }) }))
    const { value } = await get(ctx, 'session-2')
    expect((value.rows as { provider: string }[]).map(row => row.provider)).toEqual(['dsh-fe'])
    expect(value.current).toEqual({ provider: 'dsh-fe', model: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' })
  })

  it('still names a selection its preset filter hides', async () => {
    // A session mid-switch keeps pointing at the other side for a step.
    const ctx = context()
    registerClaudeModelRoute(ctx, access({ presetOf: () => 'standard', current: () => ({ provider: 'claude', model: 'opus' }) }))
    const { value } = await get(ctx, 'session-3')
    expect((value.rows as { provider: string }[]).map(row => row.provider)).toEqual(['dsh-fe'])
    expect(value.current).toEqual({ provider: 'claude', model: 'opus', name: 'Opus' })
  })

  it('lists nothing rather than failing when one provider cannot answer', async () => {
    const ctx = context()
    registerClaudeModelRoute(ctx, access({
      presetOf: () => 'standard',
      models: async provider => {
        if (provider === 'dsh-fe') throw new Error('provider is down')
        return [{ id: 'x', name: 'X' }]
      },
    }))
    const { status, value } = await get(ctx, 'session-4')
    expect(status).toBe(200)
    expect(value.rows).toEqual([])
  })

  it('keeps the rest of the list when one provider never answers', async () => {
    vi.useFakeTimers()
    try {
      const ctx = context()
      registerClaudeModelRoute(ctx, access({
        presetOf: () => 'standard',
        providers: () => [{ id: 'slow', name: 'Slow' }, { id: 'dsh-fe', name: 'DSH' }],
        models: async provider => provider === 'slow' ? new Promise(() => {}) : MODELS[provider] ?? [],
      }))
      const pending = get(ctx, 'session-5')
      await vi.advanceTimersByTimeAsync(2_100)
      const { status, value } = await pending
      expect(status).toBe(200)
      expect((value.rows as { provider: string }[]).map(row => row.provider)).toEqual(['dsh-fe'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the rest of the list when one provider throws synchronously', async () => {
    const ctx = context()
    registerClaudeModelRoute(ctx, access({
      presetOf: () => 'standard',
      providers: () => [{ id: 'broken', name: 'Broken' }, { id: 'dsh-fe', name: 'DSH' }],
      models: (provider => {
        if (provider === 'broken') throw new Error('sync boom')
        return Promise.resolve(MODELS[provider] ?? [])
      }) as ClaudeModelAccess['models'],
    }))
    const { status, value } = await get(ctx, 'session-5b')
    expect(status).toBe(200)
    expect((value.rows as { provider: string }[]).map(row => row.provider)).toEqual(['dsh-fe'])
  })

  it('lists every provider before the preset settles', async () => {
    const ctx = context()
    registerClaudeModelRoute(ctx, access({ presetOf: () => undefined }))
    const { status, value } = await get(ctx, 'session-6')
    expect(status).toBe(200)
    expect(value.preset).toBeUndefined()
    expect((value.rows as { provider: string }[]).map(row => row.provider).sort()).toEqual(['claude', 'claude', 'dsh-fe'])
  })

  it('accepts any provider before the preset settles', async () => {
    const ctx = context()
    const select = vi.fn(async () => {})
    registerClaudeModelRoute(ctx, access({ presetOf: () => undefined, select }))
    const { status } = await post(ctx, { sessionId: 'session-6', provider: 'dsh-fe', model: 'deepseek-v4-flash' })
    expect(status).toBe(200)
    expect(select).toHaveBeenCalledWith('session-6', { provider: 'dsh-fe', model: 'deepseek-v4-flash' })
  })

  it('answers an oversized body with 413, not a folded 400', async () => {
    const ctx = context()
    registerClaudeModelRoute(ctx, access())
    const res = response()
    const huge = JSON.stringify({ sessionId: 'session-1', provider: 'claude', model: 'x'.repeat(4 * 1024) })
    await ctx.handlers.get(CLAUDE_MODEL_PATH)?.(request('POST', CLAUDE_MODEL_PATH, huge), res)
    expect(res.statusCode).toBe(413)
    expect(JSON.parse(res.body)).toEqual({ error: 'body-too-large', message: 'The request body is too large.' })
  })

  it('records a selection the preset can run, canonicalising the Claude alias', async () => {
    const ctx = context()
    const select = vi.fn(async () => {})
    registerClaudeModelRoute(ctx, access({ select }))
    const { status, value } = await post(ctx, { sessionId: 'session-1', provider: 'claude', model: 'claude-opus-5-0' })
    expect(status).toBe(200)
    expect(value).toEqual({ provider: 'claude', model: 'opus' })
    expect(select).toHaveBeenCalledWith('session-1', { provider: 'claude', model: 'opus' })
  })

  it('refuses a provider the session preset does not run', async () => {
    const ctx = context()
    const select = vi.fn(async () => {})
    registerClaudeModelRoute(ctx, access({ select }))
    const { status, value } = await post(ctx, { sessionId: 'session-1', provider: 'dsh-fe', model: 'deepseek-v4-flash' })
    expect(status).toBe(409)
    expect(value).toEqual({ error: 'preset-provider-mismatch' })
    expect(select).not.toHaveBeenCalled()
  })

  it('rejects malformed input and sessions the Host no longer holds', async () => {
    const ctx = context()
    registerClaudeModelRoute(ctx, access({ hasSession: id => id === 'session-1' }))
    expect((await post(ctx, { sessionId: 'session-1', provider: 'claude' })).status).toBe(400)
    expect((await post(ctx, { sessionId: 'gone', provider: 'claude', model: 'opus' })).status).toBe(404)
    expect((await get(ctx, 'gone')).status).toBe(404)
  })

  it('reports a refused write instead of a false success', async () => {
    const ctx = context()
    registerClaudeModelRoute(ctx, access({ select: async () => { throw new Error('session-busy') } }))
    const { status, value } = await post(ctx, { sessionId: 'session-1', provider: 'claude', model: 'sonnet' })
    expect(status).toBe(409)
    expect(value).toEqual({ error: 'selection-failed', message: 'session-busy' })
  })
})
