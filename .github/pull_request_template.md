## Motivation

<!-- What problem is being solved? Link a related issue or approved plan. -->

## Changes

<!-- List focused changes, architectural ownership, compatibility and any generated lib/ updates. -->

## Testing

| Command / verification | Result (PASS / FAIL / NOT RUN) | Notes / evidence |
| --- | --- | --- |
| `node scripts/check-agent-governance.mjs` (when guidance changes) | NOT RUN | |
| `pnpm check` (required for runtime changes; CI runs for all PRs) | NOT RUN | |
| `pnpm release:verify` (packaging/CI) | NOT RUN | |
| Installed DSH Desktop smoke (when Host behavior changes) | NOT RUN | |

<!-- Report exact commands actually executed. Explain failed/skipped gates. -->

## AI Usage

<!-- State which agents/models planned, implemented and reviewed the change.
Describe how the reviewer inspected the real diff. AI review does not replace
CODEOWNERS/human approval. -->

## Risks and release boundary

<!-- Known limitations, migrations, host compatibility and rollback.
Opening this PR does NOT authorize merging, npm publishing or Desktop installs. -->
