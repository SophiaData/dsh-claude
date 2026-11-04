import { readdirSync, readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import type { ModelInfo } from '@anthropic-ai/claude-agent-sdk'
import { canonicalClaudeModelId, latestClaudeModels, recordClaudeModels, resetClaudeModels } from '../src/model-catalog.ts'

/** Real `/model` lineups, one per Claude Code release, recorded by
 *  scripts/capture-model-lineup.mts after each CLI upgrade. */
const DIRECTORY = new URL('./fixtures/claude-lineups/', import.meta.url)
const releases = readdirSync(DIRECTORY)
  .filter(name => name.endsWith('.json'))
  .map(name => ({
    version: name.slice(0, -'.json'.length),
    models: JSON.parse(readFileSync(new URL(name, DIRECTORY), 'utf8')) as ModelInfo[],
  }))
  .sort((left, right) => left.version.localeCompare(right.version, undefined, { numeric: true }))

function catalogOf(models: readonly ModelInfo[]): readonly string[] {
  resetClaudeModels()
  recordClaudeModels(models)
  return latestClaudeModels().map(row => row.id)
}

describe('Claude model lineup drift', () => {
  afterEach(() => { resetClaudeModels() })

  it('has recorded lineups to check', () => {
    expect(releases.length).toBeGreaterThanOrEqual(2)
  })

  // DSH persists a selection as the row id and prints `claude/<id>` for one no
  // row carries. Every id any earlier release advertised must therefore still
  // be a row after an upgrade, or be rewritten to one by the request hook.
  it.each(releases.slice(1).map((release, index) => [release.version, index + 1] as const))(
    'keeps every id an earlier release advertised resolvable on %s',
    (_version, index) => {
      const earlier = new Set(releases.slice(0, index).flatMap(release => catalogOf(release.models)))
      const current = new Set(catalogOf(releases[index]!.models))
      const stranded = [...earlier].filter(id => !current.has(id) && !current.has(canonicalClaudeModelId(id)))
      expect(stranded).toEqual([])
    },
  )
})

describe('aliasing a lineup id this plugin did not derive', () => {
  afterEach(() => { resetClaudeModels() })

  const row = (value: string): ModelInfo => ({
    value,
    displayName: value,
    description: '',
  }) as ModelInfo

  // The family fold exists for Anthropic's own spellings. Applied to a
  // gateway's ids it invented names the CLI rejects — `codex/gpt-6.1-terra`
  // became `codex/gpt`, the CLI answered `unrecognized_model`, and the turn
  // hung with no output until it was stopped by hand.
  it('advertises every gateway model by the id the CLI gave it', () => {
    const gateway = ['codex/gpt-6.1-terra', 'codex/gpt-6.1-sol', 'codex/gpt-6-astra', 'workbuddy/kimi-k3.1-pro', 'auto/deepseek-v4.1-flash']
    const ids = catalogOf(gateway.map(row))
    // The catalog also carries the stable aliases; what matters is that every
    // gateway row survived under its own id.
    for (const id of gateway) expect(ids, id).toContain(id)
    expect(ids).not.toContain('codex/gpt')
    expect(ids).not.toContain('workbuddy/kimi')
    expect(ids).not.toContain('auto/deepseek')
  })

  // The bug's worst shape: the whole family folded onto one alias, so the
  // `taken` collision guard handed only the first row a distinct id and the
  // rest fell back to their real names. One selector entry, three models.
  it('keeps sibling ids distinct instead of folding them together', () => {
    const family = ['codex/gpt-6.1-terra', 'codex/gpt-6.1-sol', 'codex/gpt-6-astra']
    const ids = catalogOf(family.map(row))
    // Each sibling survives under its own id, so the catalog holds three
    // distinct gpt rows rather than one alias standing in for all of them.
    for (const id of family) expect(ids, id).toContain(id)
    expect(ids).not.toContain('codex/gpt')
  })

  it('still folds Anthropic families onto their stable alias', () => {
    // `fable` is a seed alias, so a concrete row keeps its own spelling beside
    // it (reservedAliases) while the alias itself stays selectable — that is
    // what lets a persisted `fable` selection survive a version bump.
    for (const value of ['claude-fable-5-1', 'claude-fable-5-2']) {
      const ids = catalogOf([row(value)])
      expect(ids, value).toContain('fable')
      expect(ids, value).toContain(value)
    }
    // An unreleased family with no seed alias still folds onto its family name,
    // which is the behaviour this change had to preserve.
    const ids = catalogOf([row('claude-nova-7-3')])
    expect(ids).toContain('nova')
  })
})
