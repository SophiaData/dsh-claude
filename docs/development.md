# Development workflow

This guide applies to the **SophiaData** `@sophiadata-ai/dsh-claude` fork.
It supplements, and does not replace, [repository rules](../AGENTS.md)
or the [Aegis baseline governance](aegis/BASELINE-GOVERNANCE.md).

## Read authoritative references first

- [Architecture and ownership reference](aegis/spec/2026-08-15-dsh-claude-spec.md)
  is the active behavior specification; dated implementation plans are historical.
- [Aegis index](aegis/INDEX.md) distinguishes active guidance from evidence.
- [Host compatibility](dsh-host-compatibility.md) describes what tests can prove.
- [Upgrade guide](upgrading-dsh-desktop.md) owns Desktop/Host migration procedure.
- [Generated distribution contract](generated-lib-ci.md) owns `src/` vs `lib/`.
- [Release preflight](release-preflight.md) owns package publishing boundaries.

Never treat an old plan or successful build as permission to alter the
architecture baseline. If a baseline is defective, document the proposed
correction and obtain review before working around it.

## Before making a change

1. Read the relevant implementation and adjacent tests. Inspect the current
   branch, existing worktree changes, public DSH integration points, and
   applicable Aegis ownership/contract boundaries.
2. Write a task-specific plan: motivation, affected paths, non-goals,
   public API/Host compatibility risks, negative cases, and acceptance checks.
3. Prefer the smallest out-of-tree change that reuses existing abstractions.
   Do not patch the installed Harness or replace Claude Code's own loop.
4. For risky contracts, distinguish **design defect** from **implementation
   drift** using the Aegis baseline review before changing code.

## Multi-agent handoff (optional orchestration)

- **GPT Planner:** records a plan and acceptance checklist. No application
  code edits in the planning phase.
- **Claude Code / other Worker:** receives that plan, reads `AGENTS.md`,
  edits an isolated topic branch or worktree, writes regression tests, and
  returns actual changed paths, test commands, results and outstanding risks.
- **GPT Reviewer:** reads the real diff and code (not only the worker report),
  independently evaluates correctness, compatibility, security, UX and test
  evidence, then returns PASS, CHANGES_REQUESTED, or BLOCKED with findings.
- **Correction:** Worker addresses findings and reviewer checks the new diff.
  Escalate repeatedly failing or architecture-changing work to a human.

These roles are a **process convention**, not a feature of the
`dsh-claude` main-session plugin or an automatic model-routing guarantee.
A caller must actually invoke and verify its chosen subagent tools.

## Implementation boundaries

- DSH owns host presentation, approval audit and managed process lifetime.
  Claude Code owns its CLI/SDK agent loop, tools, settings and authentication.
- No undocumented Host APIs, copied private DSH internals, or unconditional
  upgrade of `@deepseek-ai/dsh-*` dependency versions.
- Keep secrets out of code, logs, screenshots, tests and PR descriptions.
- Avoid unrelated refactors, new dependencies without rationale, destructive
  migrations and changes to end-user profiles.
- When runtime behavior changes, add focused permanent regression coverage.
  For public behavior or distribution changes, update the appropriate runbook.

## Delivery

1. Check the complete diff against the initial plan and baseline; remove
   accidental changes.
2. Follow [testing](testing.md), including the generated `lib/` contract.
3. Run [pre-PR checks](../.agents/skills/dsh-claude-pre-pr/SKILL.md).
4. Open a PR using the [PR template](../.github/pull_request_template.md).
   CI, CODEOWNERS and human review are required before merge when configured.
5. Never infer that opening a PR authorizes a merge, npm release or Desktop
   installation. These are separate maintainer actions.
