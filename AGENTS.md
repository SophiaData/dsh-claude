# Repository Instructions

- Read `docs/aegis/spec/2026-08-15-dsh-claude-spec.md` before changing runtime behavior. Dated implementation plans are historical; consult a task-specific plan only when one is active. See `docs/aegis/INDEX.md` for document status.
- Keep this package out-of-tree: use only public DSH exports and do not patch the installed DSH checkout.
- After a DSH Desktop upgrade, follow `docs/upgrading-dsh-desktop.md`. The Host ships no type declarations, so `pnpm typecheck` cannot see its API drift: locate the installed Host under `resources/app/node_modules/@deepseek-ai/`, the older unpacked directory, or an extracted `app.asar` as described in the runbook and check the log for `dsh-claude client [boot-check]` / `[slot-entry-crashed]`.
- Claude Code owns its internal loop and tools; DSH owns presentation, approval audit, and managed process lifetime.
- Never log, persist, render, or test with real credentials. Redact before durable event append.
- Run `pnpm check` before claiming completion; on macOS prepend `/opt/homebrew/bin` to PATH if needed. For a linked checkout with active Desktop turns, run the build in a separate source copy to avoid hot reload, and report any failing checks explicitly.

## Cross-agent development governance

- These are repository-level instructions for **any** coding assistant, including GPT,
  Claude Code and Codex. `CLAUDE.md` is only an entry point back to this file.
- Read [development](docs/development.md) and [testing](docs/testing.md)
  before substantial changes; those guides link to the existing authoritative
  architecture, Aegis baseline and Desktop compatibility procedures.
- Use the focused repository skills when relevant:
  [plan](.agents/skills/dsh-claude-plan/SKILL.md),
  [implement](.agents/skills/dsh-claude-implement/SKILL.md),
  [review](.agents/skills/dsh-claude-review/SKILL.md) and
  [pre-PR](.agents/skills/dsh-claude-pre-pr/SKILL.md).
  These files are reusable instructions, **not** proof that a particular DSH
  model was selected or that a tool call actually ran.

### Separation of duties

- **Planner:** establish scope, constraints, risks and measurable acceptance
  criteria; do not claim implementation is complete.
- **Worker:** implement only approved scope, add regression coverage, record
  actual commands and results, and expose the Git diff for review.
- **Reviewer:** inspect the actual diff and relevant files independently;
  check acceptance criteria and evidence, classify findings by severity and
  send specific failures back for correction. A worker's summary is not proof.
- A single model may fill different roles in separate sessions, but independent
  reviews require independent evidence. Prompts and skills are guidance; Git
  permissions, CI and human review provide enforcement.

### Changes and handoff

- Use a topic branch/isolated worktree; preserve unrelated changes.
- Changes to source or build inputs require updated committed `lib/` output
  for Git URL installs; follow [generated-lib rules](docs/generated-lib-ci.md).
- Never invent check results. For runtime code run `pnpm check` and relevant
  focused tests; for governance-only changes run
  `node scripts/check-agent-governance.mjs` and disclose any skipped checks.
  CI remains the final cross-platform gate, not a substitute for Desktop smoke.
- Open a PR using [the template](.github/pull_request_template.md); do not
  auto-merge, publish packages, install or restart the user's Desktop, or
  change protected production systems without explicit authorization.
