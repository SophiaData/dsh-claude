# Preset-scoped model selection and subagent status facts

Two composer-side gaps, both closed inside the plugin.

## Model selection

The Host's model seat is a single slot entry that lists every registered
provider in every Session. This plugin registers the Claude Code provider
globally, so the Claude lineup appeared in Sessions whose preset cannot run it,
and the two sides are not interchangeable: a DSH model chosen under the Claude
preset is passed through `agent/request` unchanged, and a Claude model chosen
outside it fails the turn.

`src/model-selection.ts` states the rule, `src/model-selection-routes.ts`
serves it, and `src/client/ClaudeModelPicker.tsx` draws it in the Host's seat.

- Reads come from the Host's live provider registry (`ctx.llm.listProviders()` /
  `listModels()`); a gateway added in settings appears on the next catalog
  read (mount or preset change).
- Each provider is asked in parallel under its own 2s bound: a provider that
  rejects, throws synchronously, or never answers contributes no rows instead
  of taking the list (or the route's 5s budget) down with it.
- The write goes through the Agent's public model control when the Host provides
  one, else the session controller, and canonicalises a Claude id to a selector
  alias so a version bump does not strand a persisted pick.
- Before a Session's preset composition settles there is no side to filter to,
  so both routes behave as the Host's own do.
- The Client shadows `conversation.input.model` at a lower priority. One entry
  renders, and it is this one, in every Session. A reload starts from no
  catalog and each attempt takes a load key from a counter that is monotonic
  across mounts, so neither a preset change nor a remount joins the request it
  replaces; a failed read leaves one disabled generic trigger rather than an
  empty seat or stale rows.

## Subagent status

The task board already carried `usage.durationMs`, `usage.toolUses`,
`lastToolName`, and a settlement `summary`; the roster card drew a status word
and a tool name and nothing else.

- `memberActivityLine` and `memberDetail` in `ClaudeTeamHeaderAction.tsx` fold
  those into one detail line and one activity line per member: the tool a running
  member last reached for, else what it reported back — the only place a failure
  reason lives.
- The roster styles the activity line to wrap to two lines and colours it when
  the member failed, was killed, or was stopped.
- The teammate tab adds duration, tool count, and token total, and labels the
  settlement block "Failure" rather than "Result" when the member did not
  complete. The settlement block renders only for settled members: the task
  board also carries a progress `summary` while a task runs, and that is not a
  result.

## Known gaps

- The `/model` command contribution is not intercepted; it remains the Host's
  own unfiltered surface. Closing it needs a keyboard-safe command-palette
  takeover, deliberately out of scope here.
- The takeover carries `{provider, model}` only. A selection's
  `reasoningEffort` is not read or rewritten, and the Host seat's narrow-row
  compact display variables are not consumed by the plugin trigger.
- On a Host without the public `agent.model` control, the catalog read has no
  selection fallback and shows the generic label; the write still falls back to
  the session controller.

## Verification

`pnpm check` (typecheck both projects, vitest, tsdown build) is green.
Coverage: `test/model-selection.test.ts` (rule), `test/model-selection-routes.test.ts`
(filtering, preset-unsettled, rejected provider, synchronously-throwing provider,
hung provider, 413, refused write), `test/client-model-picker.test.tsx` (render,
pick, rollback, lock, reload failure, fresh key on preset change and on
remount), `test/client-index.test.ts` (seat priority), and the
`subagent status facts` block in `test/client-team.test.tsx`.

Not verified: the picker inside a running DSH Desktop.
