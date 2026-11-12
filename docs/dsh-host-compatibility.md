# DSH Host compatibility verification

This repository is a native Claude Code integration for the DSH Host. Passing TypeScript compilation is necessary, but a Host update can change runtime event timing, Session projections, model-selection semantics, permission state or the Desktop UI without changing the plugin's own types.

## Automated contract coverage

`pnpm check` runs typechecking, Vitest, and the build. GitHub Actions runs it on:
- Ubuntu / Node.js 22 (existing baseline)
- Windows / Node.js 22 (existing baseline)
- Ubuntu / Node.js 24 (newer Host runtime canary)

All jobs install the **locked DSH development dependency graph**, currently `@deepseek-ai/dsh-agent@0.2.1-rc.5`. The Node 24 job does **not** imply the current DSH Desktop bundle uses that same package version.

`test/dsh-host-model-contract.test.ts` uses the **real published** `@deepseek-ai/dsh-session` `Session`, with an in-memory event registration harness and a small structural adapter for the public `agent.model.current()/select()` surface. It verifies:

1. A new Claude preset selects its route before the first request, recorded as a `model/selection` Session event.
2. A reconstructed Session retains its previous Claude model choice.
3. An unrelated non-Claude preset is not rerouted by Claude's creation hook.
4. An explicit Claude model override is recorded in the Session.

At this baseline, the published `@deepseek-ai/dsh-agent@0.2.1-rc.5` **does not export an instantiable `AgentModel` constructor at runtime** (despite the newer upstream source showing one). A separate conditional canary exercises the actual `AgentModel` and model-selection projection when a future locked Host package exports them; until then it is explicitly skipped, not silently presented as a passed integration.


`test/preset-route.test.ts` additionally ensures compatibility is **per Agent**: a modern session must not disable the legacy request fallback for a different session. It also ensures the prepared request object, including explicit reasoning effort, stays unchanged on modern Hosts.

The existing permission-mode, route-budget, session and SDK-message tests remain part of every CI run.

## Scope and limitations

The current baseline tests use the real DSH Session event implementation but **not** the real AgentModel constructor or a fully mounted Host. They use a structural model-control adapter and in-memory event hooks. They do **not** boot DSH Desktop, communicate with the local Claude CLI, test real authentication, write the Desktop persistence backend, or validate native client slots. In particular, passing these tests **cannot** be reported as an end-to-end Desktop compatibility certification.

The version-lock ensures repeatability, not coverage of an arbitrarily newer Host. Before claiming compatibility with a new Desktop release, update the development dependency graph and lockfile in a dedicated upgrade PR, run these tests and the full CI, then perform the manual acceptance cases below. Avoid silently drifting all DSH peers to latest on every CI run.

## Desktop smoke tests (manual release gate)

Record the actual **DSH Desktop version, Node.js version, plugin commit, OS, and install method**.

1. Start a clean Claude session; verify Claude is selected before sending any prompt.
2. Switch between Claude and a native/non-Claude preset in a **blank** session; confirm each routes to its own provider and model.
3. Select two different Claude models in separate sessions. Returning to the first must not inherit the other session's route.
4. Create a conversation, select a non-default Claude model, fully restart Desktop, resume that session and verify its model selection persists.
5. While a turn is running, switch models in the supported Host UI; verify the next prepared step uses the new choice without rewriting an already prepared request.
6. Verify approval-deny, approval-once and plan review in a disposable workspace; never use destructive commands for the test.
7. Verify streamed responses, interrupt/restart, and one harmless Claude tool invocation.
8. Re-test a legacy Host only if that version remains officially supported.
9. Install from the GitHub repository URL in a disposable profile and confirm the committed `lib/` contains the same fix as `src/`.

After updating the DSH Host, capture `dsh-claude client [boot-check]` warnings and any startup exceptions. An unresolved incompatibility blocks declaring that Host release supported, even if this repository's CI is green.

## Deployment boundary

These tests and workflows **never** merge, publish npm packages, restart users' Desktop installs, or automate production releases. Review and merge remain explicit operations.
