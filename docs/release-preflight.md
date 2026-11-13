# Installing, updating and verifying `dsh-claude` distributions

The plugin has three separate distribution channels. They are **not** interchangeable: switching sources without an explicit user action can replace the reviewed build with different code.

## Choose one source and keep it

| Source | Installation example | Update policy |
| --- | --- | --- |
| npm registry | `dsh plugin --profile desktop add @sophiadata-ai/dsh-claude` | The Settings updater checks **only** `@sophiadata-ai/dsh-claude` on npm, and may install its exact newer version via DSH's native `plugin add` command. |
| GitHub repository | `dsh plugin --profile desktop add https://github.com/SophiaData/dsh-claude` | **Manual only.** Re-run the DSH plugin-manager installation from that same trusted URL after reviewing the new `master` commit; restart Desktop. |
| GitHub release asset | `dsh plugin --profile desktop add ./sophiadata-ai-dsh-claude-<version>.tgz` | **Manual only.** Review a new release and deliberately install that release's prebuilt tarball; restart Desktop. |
| Source checkout `link:` | `dsh plugin --profile desktop add "link:<absolute-path>"` | **Manual developer workflow.** Update and rebuild only after active turns finish; restart Desktop. |

The updater intentionally refuses silent source conversion for Git links, tarballs, and linked checkouts. A newer version on the upstream `@norman-else/dsh-claude` npm scope **must never** be offered as an upgrade to the SophiaData fork. When the scoped npm registry is unavailable, an installed npm version is shown as known but update availability is unknown: the updater fails closed.

A Git URL resolves when the DSH installer is run; an already installed package does **not** continuously follow `master`. If repeatable installation is essential, prefer a reviewed release tarball or a deliberately pinned Git revision supported by the installed DSH version. Review and preserve the active profile before changing it.

## Offline release preflight — safe for CI

The default CI matrix runs these commands on Ubuntu/Node 22, Ubuntu/Node 24 and Windows/Node 22:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm release:verify
```

`release:verify` runs **`npm pack --dry-run --json --ignore-scripts --offline`** and checks the actual resulting tarball file list. It requires only local Node/npm/pnpm and built files. It does **not** call npm login, access GitHub, fetch a remote branch, publish, create a tag, commit, push, install the plugin or restart Desktop.

The verifier fails if:

- a published entry (`main`, `types`, `bin`, or `exports`) is not present in the tarball, or points outside `lib/` (except `./package.json`);
- the DSH bundle patch or managed legacy preset assets are missing;
- source, tests, CI workflows, scripts or obvious sensitive files (`.npmrc`, `.env.*`) leak into the published package;
- the tarball scope/version disagrees with the manifest, or file entries are malformed/duplicated.

This is a packaging contract, not an exhaustive secret scanner or an end-to-end DSH Desktop boot test. It runs **after** `pnpm check` so the compiled artifacts exist. The existing CI generated-lib gate also checks that those artifacts are committed when source/build inputs change, protecting Git URL installs.

## Release procedure (explicit maintainer action only)

1. Review the release branch and CI; check `pnpm release:verify` and the generated-lib consistency gate.
2. In a disposable profile, install the *intended* source using the examples above and complete the smoke tests in [INSTALL.md](../INSTALL.md), including a full Desktop restart.
3. Review release version, changelog and provenance of the npm/release tarball. Verify your current `master` checkout is clean and synchronized with the remote.
4. A maintainer with npm and GitHub credentials may run `pnpm release:check` to perform the **online**, authenticated plan/dry-run checks.
5. Only after approval, the maintainer may explicitly run `pnpm release`. That command may create a version commit and push it, publish to npm, and create the GitHub release; **never run it in an ordinary CI job or as part of PR checks**.
6. Independently verify the resulting exact npm package / GitHub release asset and the Desktop smoke test before declaring the release supported.

If the registry cannot be reached, or a planned release has already been published from a different commit, stop; do not bypass the provenance guard or fall back to a different npm scope.

## DSH built-in plugin manager

Prefer the DSH plugin manager for installation/reinstallation and profile lifecycle. The plugin's own updater uses the DSH CLI rather than implementing package replacement itself. Do not adopt newer DSH plugin-manager APIs in this branch unless the locked Host dependency graph is upgraded and compatible behavior has been tested; Host 0.2.1-rc.5 remains the current development baseline.
