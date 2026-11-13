# Claude Code native MCP / Skills / Hooks compatibility contract

The plugin embeds **Claude Code's own SDK process** rather than reimplementing MCP, Skills or filesystem-configured Hooks in DSH. DSH provides session presentation and permission prompts; Claude Code owns tool execution, Skill discovery and its hook runtime.

## Ownership boundaries

| Capability | Owner | Plugin contract |
| --- | --- | --- |
| MCP server discovery/config | Claude Code CLI | `settingSources: ['user', 'project', 'local']`; no plugin-supplied `mcpServers` override |
| Native Claude tools | Claude Code CLI | `tools: { type: 'preset', preset: 'claude_code' }`; no DSH `allowedTools` whitelist |
| Skills and Claude slash commands | Claude Code CLI | `supportedCommands()` projects names into DSH's slash menu; sending a selected Skill forwards the **exact Claude name** as a user message |
| CLAUDE.md / project conventions | Claude Code CLI | SDK uses the full user/project/local setting sources and Claude's system-prompt preset with a bounded plugin append |
| User-configured Hooks | Claude Code CLI | Filesystem settings are enabled; the plugin contributes only its own in-process `PermissionDenied` and `PreToolUse` callbacks |
| MCP/native tool approvals | DSH (via SDK `canUseTool`) | Every tool name, including `mcp__...`, reaches the same active-turn DSH approval bridge; no active turn means **deny** |
| Auto-mode denied tool retries | Claude Code + DSH | After the CLI classifier denies a call, a one-shot `PreToolUse` hook changes only that exact retry to **ask**, not **allow** |

Do **not** register Claude MCP tools as DSH executors, replace `tools` with presentation mirrors, add `--strict-mcp-config` to the **primary** interactive Query, or translate Claude Skills into Host command execution. The auxiliary prompt-refine and read-only ask subprocesses are intentionally isolated and have different security contracts; do not mistake those for the main Claude Query.

## Automated regression evidence

The CI suite checks:
- `test/supervisor.test.ts`: real Query options passed to the injected Claude SDK factory, and fail-closed MCP approval with a live fake DSH turn
- `test/permission.test.ts`: classifier-denied MCP tool retries are scoped to matching tool/input, single-use, and per Query
- `test/client-claude-command-source.test.ts`: a qualified Skill still reaches Claude with its original identifier and arguments even when DSH owns a conflicting slash name
- `test/sdk-messages.test.ts`: native MCP tool name and tool-use ID survive Claude SDK message normalization
- Existing `test/spawn.test.ts` verifies executable isolation, environment sanitization, and PATH support for local Hooks

CI runs on Ubuntu/Node 22, Ubuntu/Node 24, and Windows/Node 22. It does **not** start a real Claude CLI, authenticate to MCP servers, or execute user-defined Hooks, since those actions could require external services, secrets, or local user state.

## Desktop smoke test (manual release gate)

In a **disposable repository** and an isolated Claude account/profile, record the DSH Desktop version, Claude CLI version, OS, plugin commit, and observed outcome:

1. Define a harmless project-local Skill under `.claude/skills/` and confirm it appears in the Claude slash menu. Invoking it should create an ordinary Claude user message, not a DSH command/tool.
2. Add a harmless MCP server in a supported Claude configuration scope; confirm `/mcp` and the Claude tool catalog see it, then request a read-only tool call. Verify that an approval-required call surfaces a DSH permission prompt and that denial is respected.
3. Add a project-local `PreToolUse` Hook that writes a marker to a **temporary test file**; verify it executes under Claude CLI without DSH translating it into a Host tool. Check the process PATH if the hook uses `node` or `pnpm`.
4. In Claude `auto` permission mode, cause a benign tool call to be denied by the classifier if possible; verify a retry is offered through DSH approval rather than silently allowed. Classifier behavior is model-dependent, so record `not reproducible` instead of forcing an unsafe denial.
5. Confirm a missing active Session cannot authorize an MCP tool, and switching sessions does not carry stale hook retry state.
6. Restart DSH and resume the Claude Session; verify Skills and MCP settings remain owned by Claude, and check for hook errors.

**Environment caveat:** `createManagedClaudeSpawner` intentionally strips credential-shaped environment keys and `DSH_*` variables before launching the CLI. A custom MCP server or Hook relying on a secret from the parent Desktop environment might therefore need a supported Claude-specific configuration/credential setup. Do not remove this isolation or echo secrets into CI logs merely to make such a test pass.

## Safety and release criteria

A green CI certifies code-level contracts against the **locked** SDK/DSH dependency graph, not compatibility with every installed Claude CLI or Desktop release. Keep production-like credentials, destructive Hooks, and data-changing MCP tools out of this test plan. Release only after a maintainer has separately checked the relevant Desktop scenarios.
