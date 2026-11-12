# Generated `lib/` CI contract

`@sophiadata-ai/dsh-claude` supports installation from its GitHub URL without an install-time build. The repository therefore commits the build output under `lib/` in addition to `src/`. A source-only change can pass typechecking and tests while Git installs still run the old compiled code.

## Pull requests: enforce source/build consistency

The existing cross-platform `CI` workflow runs `pnpm check` (typecheck, Vitest, and tsdown) on Ubuntu and Windows. Its Ubuntu leg additionally checks the post-build working tree for modified, deleted, **or untracked** `lib/` files when the PR/push changes an input under `src/`, `lib/`, `tsdown.config.ts`, `package.json`, or `pnpm-lock.yaml`.

A PR that changes TypeScript or build inputs must therefore regenerate and commit `lib/` before it can pass. Run:

```bash
pnpm install --frozen-lockfile
pnpm check
git add lib/
git commit -m "chore(build): synchronize generated lib"
```

Only the Ubuntu job enforces byte-for-byte build reproducibility. The Windows job still runs the full typecheck, tests, and build.

**Bootstrap caveat:** the initial automation-only PR does not edit source/build inputs, so the new gate does not block that PR on the pre-existing stale `lib/`. The master-side workflow below repairs that existing drift after this CI setup is merged.

## Default branch: automatically propose drift repairs

The `Sync generated lib` workflow runs after a push to `master` and can also be started manually from the Actions tab. It:

1. Checks out **master only** (never untrusted pull-request code with write privileges).
2. Installs the locked dependencies on Node.js 22 / pnpm 11.28.5.
3. Runs `pnpm check` before considering a change.
4. If `lib/` differs, creates or updates branch `automation/sync-generated-lib` and opens a **Draft PR** containing only `lib/` changes.
5. Never pushes directly to `master`, merges a PR, or publishes a package.

If the output is already consistent, the action creates no PR and normally closes any stale automated repair PR. This design deliberately makes generated-code updates reviewable rather than silently changing production installs.

### GitHub Actions permissions

The sync workflow needs `contents: write` and `pull-requests: write` only for its own job. Repositories or organizations that forbid Actions from opening PRs must enable that capability before automatic PR creation will succeed. The PR build/check workflow remains read-only.

GitHub's `GITHUB_TOKEN`-authored commits and PRs generally do not trigger additional `push`/`pull_request` workflows automatically. The sync workflow runs `pnpm check` **before** creating its PR, but reviewers should still confirm the generated PR's diff and any required branch-protection checks. If policy requires conventional PR checks, trigger/re-run them using an authorized human or approved GitHub App token rather than relying on auto-triggering.

### Recovery / verification

- After merging this CI setup, watch Actions → **Sync generated lib**. The first run should create a Draft PR because an earlier source change did not update `lib/`.
- Inspect that generated PR and merge it separately once checks and any Desktop smoke tests are acceptable. Only then will fresh GitHub installations use the new compiled code.
- If automatic PR creation is blocked, inspect the workflow log and GitHub Actions permissions; the source and `master` remain unchanged.
- To force another scan after changing workflow permissions, use **Run workflow** for `Sync generated lib` on `master`.

## Security boundary

Never replace this workflow with `pull_request_target` that executes a PR checkout while holding a write-capable token. Do not automatically merge repair PRs: compiled `lib/` is executable code and merits the same review as its TypeScript source.
