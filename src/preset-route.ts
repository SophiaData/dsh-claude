import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-jobs'
import { CLAUDE_CODE_PROVIDER } from './constants.ts'
import { CLAUDE_COMMANDS_SERVICE } from './command-bridge.ts'
import { claudePresenterDefinitions } from './presenters.ts'
import { canonicalClaudeModelId, isForeignClaudeModelId } from './model-catalog.ts'
import { publicModelControl } from './preset-model-sync.ts'

export const name = 'claude-code-preset-route'
export const inject = ['tools', 'commands']

export interface Config {
  model?: string
}

export function apply(ctx: Context, config: Config = {}): void {
  // DSH >= 0.2.1-alpha.4 fixes provider/model BEFORE agent/request.
  // Selecting in the Agent creation event is synchronous and happens before
  // its first model step. No request header may be rewritten after preparation.
  // Legacy Hosts without agent.model continue using the old request hook.
  let hasPublicModelControl = false
  ctx.on('agent/created', ({ agent }) => {
    if (ctx.get('agentPresets')?.composedPreset(agent.ctx) !== 'claude') return
    const control = publicModelControl(agent)
    if (control === undefined) return
    hasPublicModelControl = true
    const current = control.current()
    const selected = config.model
      ?? (current?.provider === CLAUDE_CODE_PROVIDER ? current.model : 'default')
    const model = isForeignClaudeModelId(selected) ? 'default' : canonicalClaudeModelId(selected)
    if (current?.provider === CLAUDE_CODE_PROVIDER && current.model === model) return
    control.select({ provider: CLAUDE_CODE_PROVIDER, model })
  })

  // Compatibility only: older DSH versions let a preset rewrite the request
  // route. Newer versions reject this after step preparation; do not mutate
  // their fixed provider/model selection, even when a previous choice is stale.
  ctx.on('agent/request', async (_payload, next) => {
    const upstream = await next()
    if (hasPublicModelControl) return upstream
    const selected = config.model ?? upstream.model ?? 'default'
    const model = isForeignClaudeModelId(selected) ? 'default' : canonicalClaudeModelId(selected)
    return { ...upstream, provider: CLAUDE_CODE_PROVIDER, model }
  })

  // Expose the effective Host command names for collision-safe projection.
  // Claude Skills are not registered as Host commands: the Client slash source
  // submits them as ordinary messages, so no command lifecycle row is created.
  ctx.provide(CLAUDE_COMMANDS_SERVICE, {
    list: agent => ctx.commands.list(agent as never),
  })
  // Presentation-only tool mirrors, scoped to this preset's agents: they let
  // the host compute native render intents for the mirrored Claude tool
  // events. Claude Code owns execution; the stub `execute` never runs.
  for (const definition of claudePresenterDefinitions()) {
    ctx.effect(() => ctx.tools.register(definition), `dsh-claude: ${definition.name} presentation`)
  }
  // `ctx.jobs.start` refuses an owner no attached controller serves. The
  // shipped presets get theirs from dsh-tool-jobs, which this preset does not
  // load (Claude Code owns job collection); attach one for this preset's
  // agents so mirrored tasks (host-jobs.ts) can register. Optional: a Host
  // without a job registry runs as before.
  ctx.inject(['jobs'], jobsCtx => {
    jobsCtx.effect(() => jobsCtx.jobs.attachController('dsh-claude'), 'dsh-claude: job controller')
  })
}
