import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Menu, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClaudeModelCatalogView, ClaudeModelOption, ClaudeModelSelectionView } from '../model-selection.ts'
import { sessionRowPreset, type SessionPresetRow } from './session-preset.ts'
import type { ClaudeCodeSettingsKey } from './locales.ts'
import * as styles from './styles.ts'

export interface ClaudeModelPickerInjected {
  t: (key: ClaudeCodeSettingsKey, params?: Record<string, unknown>) => string
  /** The catalog for this Session's preset, and its current pick.
   *  `key` distinguishes attempts: a preset change re-reads the same URL, and
   *  the transport must not coalesce the new read into the request it is
   *  replacing (which this component aborts). */
  load: (key: string, signal?: AbortSignal) => Promise<ClaudeModelCatalogView>
  /** Record one pick; the Host answers for itself when it refuses. */
  select: (provider: string, model: string) => Promise<void>
  notify?: (level: 'info' | 'error', text: string) => void
}

export interface ClaudeModelPickerProps extends ClaudeModelPickerInjected {
  useSessions: SnapshotSelectorHook<{ readonly byId: Readonly<Record<string, SessionPresetRow | undefined>> }>
  sessionId: string
  /** The composer refuses interaction while a turn runs. */
  locked?: boolean
}

const PICKER_CLASS = 'dshClaudeModelPicker'

/** Monotonic across mounts, unlike a per-instance ref: a remount of the same
 *  Session's seat must not reuse a key whose request is still in flight. */
let loadAttempt = 0

function rowKey(row: { provider: string; id: string }): string {
  return `${row.provider}\u0000${row.id}`
}

function glyph(): ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.25l5.25 3v5.5L8 13.75l-5.25-3v-5.5l5.25-3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 8l5.25-3M8 8v5.75M8 8L2.75 5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

/** The composer's model selector, drawn from the Session's preset.
 *
 *  The Host's own seat lists every registered provider in every Session, and
 *  this plugin registers Claude Code globally, so the Claude lineup would
 *  otherwise appear everywhere — and a pick from the wrong side is not a
 *  harmless one: it errors the next turn. This takes the same seat (a single
 *  slot, shadowed by a lower `priority`) and offers only the models the preset
 *  can actually run.
 *
 *  A failed catalog read leaves one disabled generic trigger rather than an
 *  empty seat: the reader sees the control is there and why it cannot be
 *  opened. A reload starts from no catalog, so rows belonging to the previous
 *  preset are never left selectable behind a failed or in-flight read. */
export function ClaudeModelPicker({ t, sessionId, load, select, notify, useSessions, locked = false }: ClaudeModelPickerProps) {
  const preset = useSessions(state => sessionRowPreset(state.byId[sessionId]))
  const [catalog, setCatalog] = useState<ClaudeModelCatalogView | null>(null)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // The injected faces are rebuilt whenever the seat re-renders; the effect
  // below keys on the preset alone, so it reads them through refs.
  const loadRef = useRef(load)
  loadRef.current = load
  const selectRef = useRef(select)
  selectRef.current = select

  useEffect(() => {
    const controller = new AbortController()
    setCatalog(null)
    setFailure(undefined)
    loadAttempt += 1
    loadRef.current(`${sessionId}:${loadAttempt}`, controller.signal).then(next => {
      if (!controller.signal.aborted) setCatalog(next)
    }, (error: unknown) => {
      if (controller.signal.aborted) return
      setFailure(error instanceof Error ? error.message : String(error))
    })
    return () => { controller.abort() }
  }, [preset, sessionId])

  const choose = (row: ClaudeModelOption): void => {
    setOpen(false)
    const previous = catalog?.current ?? null
    if (previous?.provider === row.provider && previous.model === row.id) return
    // The pick shows at once; a refused write puts the previous one back, so the
    // trigger never claims a selection the Session does not hold.
    const chosen: ClaudeModelSelectionView = { provider: row.provider, model: row.id, name: row.name }
    setCatalog(current => current === null ? current : { ...current, current: chosen })
    setBusy(true)
    selectRef.current(row.provider, row.id).catch((error: unknown) => {
      setCatalog(current => current === null ? current : { ...current, current: previous })
      notify?.('error', t('modelSelectFailed', { message: error instanceof Error ? error.message : String(error) }))
    }).finally(() => { setBusy(false) })
  }

  const rows = catalog?.rows ?? []
  const current = catalog?.current ?? null
  const label = current === null ? t('modelSelect') : current.name ?? current.model
  const disabled = locked || busy || catalog === null || rows.length === 0
  const hint = failure !== undefined ? t('modelSelectUnavailable') : locked ? t('modelSelectLocked') : t('modelSelectHint')

  return (
    <span className={`${PICKER_CLASS} ${styles.permissionSelectClass}`}>
      <style data-dsh-claude-model-picker-styles>{styles.permissionSelectCss}{styles.permissionSelectRowCss}</style>
      <Menu
        open={open}
        items={rows.map(row => ({
          id: rowKey(row),
          label: (
            <span className={styles.permissionSelectRowClass}>
              <span className={styles.permissionSelectRowNameClass}>{row.name}</span>
              <span className={styles.permissionSelectRowHintClass}>
                {row.description === undefined ? row.providerName : `${row.providerName} · ${row.description}`}
              </span>
            </span>
          ),
          ...(current !== null && rowKey({ provider: current.provider, id: current.model }) === rowKey(row) ? { icon: glyph() } : {}),
        }))}
        selectedId={current === null ? undefined : rowKey({ provider: current.provider, id: current.model })}
        onSelect={id => {
          const row = rows.find(candidate => rowKey(candidate) === id)
          if (row !== undefined) choose(row)
          else setOpen(false)
        }}
        onClose={() => { setOpen(false) }}
        side="top"
        anchor={(
          <Tooltip label={hint} side="top" delayMs={250} disabled={open}>
            <button
              type="button"
              className={styles.permissionSelectTriggerClass}
              aria-label={t('modelSelectAria', { name: label })}
              aria-haspopup="menu"
              aria-expanded={open}
              disabled={disabled}
              onClick={() => { setOpen(!open) }}
            >
              <span className={styles.permissionSelectIconClass}>{glyph()}</span>
              <span className={styles.permissionSelectLabelClass}>{label}</span>
              <svg className={styles.permissionSelectChevronClass} width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" data-open={open ? '' : undefined}>
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </Tooltip>
        )}
      />
    </span>
  )
}
