---
name: dsh-claude-implement
description: Implement an approved dsh-claude change in a topic branch with focused regression tests, DSH public API boundaries, generated lib consistency and truthful test evidence.
---

# Implement an approved change

1. Read [repository rules](../../../AGENTS.md), the approved plan and
   [development workflow](../../../docs/development.md).
2. Verify branch/worktree scope and current uncommitted changes. Never
   overwrite unrelated work or modify the installed DSH checkout.
3. Preserve Claude Code's own loop and the Host/plugin ownership boundary.
   Prefer a small public-API adaptation over private Host internals.
4. Update relevant tests and documentation alongside behavior changes.
5. Run targeted checks; for runtime changes run `pnpm check`. If source or
   build inputs changed, regenerate and include committed `lib/`.
6. Return a handoff with changed files, exact tests run and observed outcomes,
   known gaps, Host compatibility risks and diff for independent review.
7. Never call the work 'reviewed', publish it or merge it yourself.
