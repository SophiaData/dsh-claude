# Agent Note: Escape cancel and boot-probe foreign-model guard

Status: implemented — settings Escape no longer saves a cancelled draft; foreign slash ids defer only while the boot probe is in flight.

## Problem

Two defects from the `v0.2.2..HEAD` review:

1. `GlobalSettingText` submitted on blur. Escape restored the committed value in state but did not blur or suppress the following blur save, so a cancelled edit could still be written.
2. `isForeignClaudeModelId` treated every unlisted slash id as foreign. On cold start, before the boot lineup probe finished, a gateway model the CLI was about to list (`auto/…`, `cursor/…`) could be folded to `default`.

## Decision

- Escape sets a one-shot skip-save flag, restores the committed draft, and blurs. The blur handler clears the flag and returns without calling `onChange`.
- `isForeignClaudeModelId` returns false for unlisted slash ids only while `inflight` (the boot `ensureClaudeModels` probe) is set. After the probe settles — success or failure — unlisted slash ids fold again. A failed probe must not permanently pass foreign ids through to the CLI.

## Alternatives considered

- Escape-only restore without blur — rejected; focus would stay in the field and a later blur could still race the restored draft.
- Defer foreign folding whenever `!claudeLineupKnown()` — rejected; a failed probe leaves `latest` undefined forever and would permanently skip the foreign guard.
- Await the probe inside preset-route / ask before classifying — rejected; the module-level `inflight` check is the smaller change and matches the existing cache shape.

## Acceptance criteria

- Escape after editing a Claude settings text field restores the prior value and does not call `onChange`.
- Enter still blurs and saves.
- While `ensureClaudeModels` is in flight, unlisted slash ids are not foreign; after settle, listed gateway ids stay, unlisted slash ids fold.
- `pnpm check` passes.

## Risks

If a Host never calls `ensureClaudeModels`, behavior matches the pre-fix foreign guard (unlisted slash ids fold immediately). Desktop connect does call it.
