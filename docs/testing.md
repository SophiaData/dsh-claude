# Testing and evidence policy

This document is specific to `@sophiadata-ai/dsh-claude`.
The canonical project command list is in [AGENTS.md](../AGENTS.md);
[Desktop compatibility](dsh-host-compatibility.md) and
[release preflight](release-preflight.md) describe additional gates.

## Verification tiers

| Tier | Command / owner | What it proves |
| --- | --- | --- |
| Focused unit regression | `pnpm exec vitest run test/<related>.test.ts` | Selected behavior; use the actual owning file |
| Full repository check | `pnpm check` | Typecheck, Vitest tests and tsdown build |
| Package-file audit | `pnpm release:verify` | Offline published tarball file list |
| Agent guidance contract | `node scripts/check-agent-governance.mjs` | Required instructions and local Markdown links |
| Cross-platform CI | GitHub Actions `CI` | Locked dependencies; Ubuntu Node 22/24 and Windows Node 22 |
| Installed Desktop smoke | [INSTALL](../INSTALL.md) and [Host compatibility](dsh-host-compatibility.md) | Real Host/CLI integration, manual and environment-dependent |

**A passing unit suite or TypeScript build is not proof of Desktop runtime
compatibility.** Real installed Host behavior, permissions, session resume,
streaming and native UI must be checked separately when affected.

## Evidence selection

- For behavior changes, add a regression case for the failure being fixed.
  Include success, rejection/error and cleanup paths as applicable.
- For source/build inputs, run `pnpm check`, regenerate and commit `lib/`.
  The CI generated-lib gate verifies source/build consistency on Linux.
- For packaging changes, also run `pnpm release:verify`.
- For documentation, skills, Agent rules or CI-only changes, run the standalone
  guidance check. The existing CI still runs the full repository check and
  package verification; do not skip those checks in the workflow.
- For Host API changes, isolate them in a dedicated compatibility update,
  use the locked Host graph and follow the manual Desktop acceptance matrix.
- Do not execute npm publication, automatic merging, installation or Desktop
  restarts as part of CI or a routine PR.

## Reporting results

Every PR should provide an evidence table with: command, status
(`PASS`/`FAIL`/`NOT RUN`), environment, and any relevant output or link.
Never report planned commands as executed. A failed or skipped check requires
a reason; document remaining risk rather than silently downgrading the gate.

Model-generated reviewer approval cannot replace CI, CODEOWNERS, or an
authorized maintainer's decision. Keep credentials and local profile data
out of recorded test evidence.
