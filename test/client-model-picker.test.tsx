// @vitest-environment jsdom
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClaudeModelPicker } from '../src/client/ClaudeModelPicker.tsx'
import { en, type ClaudeCodeSettingsKey } from '../src/client/locales.ts'
import type { ClaudeModelCatalogView } from '../src/model-selection.ts'
import type { SessionPresetRow } from '../src/client/session-preset.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const t = (key: ClaudeCodeSettingsKey, params?: Record<string, unknown>): string =>
  en[key].replace(/\{(\w+)\}/gu, (_match, name: string) => String(params?.[name] ?? ''))

const CLAUDE_CATALOG: ClaudeModelCatalogView = {
  preset: 'claude',
  current: { provider: 'claude', model: 'opus', name: 'Opus' },
  rows: [
    { provider: 'claude', providerName: 'Claude Code', id: 'default', name: 'Default (recommended)' },
    { provider: 'claude', providerName: 'Claude Code', id: 'opus', name: 'Opus', description: 'Deepest reasoning' },
  ],
}

let mounted: Root | undefined

afterEach(() => {
  const root = mounted
  mounted = undefined
  if (root !== undefined) act(() => { root.unmount() })
  document.body.replaceChildren()
})

function mount({ preset = 'claude', catalog = CLAUDE_CATALOG, locked = false, load, select, notify }: {
  preset?: string
  catalog?: ClaudeModelCatalogView
  locked?: boolean
  load?: (key: string, signal?: AbortSignal) => Promise<ClaudeModelCatalogView>
  select?: (provider: string, model: string) => Promise<void>
  notify?: (level: 'info' | 'error', text: string) => void
} = {}): { select: ReturnType<typeof vi.fn>; setPreset: (preset: string | undefined) => void } {
  const chosen = vi.fn(select ?? (async () => {}))
  const rows: Record<string, SessionPresetRow> = { 'session-1': { agentPreset: preset } }
  const container = document.createElement('div')
  document.body.append(container)
  mounted = createRoot(container)
  const render = (): void => {
    act(() => {
      mounted?.render(<ClaudeModelPicker
        t={t}
        sessionId="session-1"
        load={load ?? (async () => catalog)}
        select={chosen}
        {...(notify === undefined ? {} : { notify })}
        useSessions={<S,>(selector: (value: { readonly byId: Readonly<Record<string, SessionPresetRow | undefined>> }) => S): S => selector({ byId: rows })}
        locked={locked}
      />)
    })
  }
  render()
  return {
    select: chosen,
    setPreset: next => {
      rows['session-1'] = next === undefined ? {} : { agentPreset: next }
      render()
    },
  }
}

function trigger(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('.dshClaudeModelPicker .dshClaudePermissionSelectTrigger')
}

function items(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
}

function click(element: Element | null | undefined): void {
  act(() => { (element as HTMLElement).click() })
}

async function settle(): Promise<void> {
  await act(async () => { await Promise.resolve() })
}

describe('Claude model picker', () => {
  it('shows the session\'s current model in the Host trigger metrics', async () => {
    mount()
    await settle()
    expect(trigger()?.textContent).toBe('Opus')
    expect(trigger()?.getAttribute('aria-label')).toBe('Model: Opus')
    expect(trigger()?.disabled).toBe(false)
  })

  it('lists the catalog it was handed, with provider and description per row', async () => {
    mount()
    await settle()
    click(trigger())
    expect(items().map(row => row.querySelector('.dshClaudePermissionSelectRowName')?.textContent))
      .toEqual(['Default (recommended)', 'Opus'])
    expect(items().map(row => row.querySelector('.dshClaudePermissionSelectRowHint')?.textContent))
      .toEqual(['Claude Code', 'Claude Code · Deepest reasoning'])
  })

  it('records a pick and shows it before the Host answers', async () => {
    const { select } = mount()
    await settle()
    click(trigger())
    click(items().find(row => row.querySelector('.dshClaudePermissionSelectRowName')?.textContent === 'Default (recommended)'))
    expect(select).toHaveBeenCalledWith('claude', 'default')
    expect(trigger()?.textContent).toBe('Default (recommended)')
  })

  it('keeps the old selection and says why when the Host refuses', async () => {
    const notify = vi.fn()
    mount({ notify, select: async () => { throw new Error('preset-provider-mismatch') } })
    await settle()
    click(trigger())
    click(items().find(row => row.querySelector('.dshClaudePermissionSelectRowName')?.textContent === 'Default (recommended)'))
    await settle()
    expect(trigger()?.textContent).toBe('Opus')
    expect(notify).toHaveBeenCalledWith('error', 'Could not switch the model: preset-provider-mismatch')
  })

  it('locks the trigger while a turn runs', async () => {
    mount({ locked: true })
    await settle()
    expect(trigger()?.disabled).toBe(true)
  })

  it('leaves one disabled trigger rather than an empty seat when the catalog fails', async () => {
    mount({ load: async () => { throw new Error('route-missing') } })
    await settle()
    expect(trigger()).not.toBeNull()
    expect(trigger()?.disabled).toBe(true)
  })

  it('drops the stale catalog when a reload fails', async () => {
    let fail = false
    const load = vi.fn(async (): Promise<ClaudeModelCatalogView> => {
      if (fail) throw new Error('route-missing')
      return CLAUDE_CATALOG
    })
    const { setPreset } = mount({ load })
    await settle()
    expect(trigger()?.disabled).toBe(false)
    fail = true
    setPreset('standard')
    await settle()
    // Rows from the previous preset must not stay selectable behind a failed read.
    expect(trigger()?.disabled).toBe(true)
    click(trigger())
    expect(items()).toHaveLength(0)
  })

  it('re-reads under a fresh key when the preset settles', async () => {
    const load = vi.fn(async (): Promise<ClaudeModelCatalogView> => CLAUDE_CATALOG)
    const { setPreset } = mount({ preset: 'standard', load })
    await settle()
    setPreset('claude')
    await settle()
    expect(load).toHaveBeenCalledTimes(2)
    const keys = load.mock.calls.map(call => call[0])
    expect(new Set(keys).size).toBe(2)
  })

  it('takes a new key when the same Session seat remounts', async () => {
    const load = vi.fn(async (): Promise<ClaudeModelCatalogView> => CLAUDE_CATALOG)
    mount({ load })
    await settle()
    // A remount must not reuse a key whose request may still be in flight.
    const root = mounted
    mounted = undefined
    act(() => { root?.unmount() })
    document.body.replaceChildren()
    mount({ load })
    await settle()
    const keys = load.mock.calls.map(call => call[0])
    expect(keys.length).toBeGreaterThanOrEqual(2)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
