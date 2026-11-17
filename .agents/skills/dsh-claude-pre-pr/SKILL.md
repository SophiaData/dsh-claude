---
name: dsh-claude-pre-pr
description: Prepare a reviewable dsh-claude pull request by checking diff scope, recorded test evidence, committed generated lib, safety boundaries and the PR template before requesting human review.
---

# Pre-PR checks

1. Read [repository rules](../../../AGENTS.md) and
   [testing policy](../../../docs/testing.md).
2. Inspect `git status --short --branch` and the complete diff from the
   verified target branch. Do not assume an unknown base.
3. Run `node scripts/check-agent-governance.mjs` for instruction changes.
   For source changes run relevant focused tests and `pnpm check`; for
   packaging changes add `pnpm release:verify`.
4. Verify `lib/` is committed whenever a source/build input changed.
   Do not force regeneration of unrelated build drift for a documentation-only
   change; let the existing CI scope gate decide.
5. Record *only* tests actually run with PASS/FAIL/NOT RUN and limitations.
   Do not disguise missing Desktop smoke tests as passing.
6. Use the [PR template](../../../.github/pull_request_template.md), include
   motivation, changes, testing, AI usage, risks and human review requirements.
7. A PR is a review request. Never auto-merge, release, install or restart
   a production Desktop as part of this process.
