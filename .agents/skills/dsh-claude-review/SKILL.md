---
name: dsh-claude-review
description: Independently review a dsh-claude implementation against its plan, active architecture baseline, actual Git diff, tests, security and DSH Desktop compatibility boundaries.
---

# Independently review an implementation

1. Read [repository rules](../../../AGENTS.md), the approved plan and
   [testing policy](../../../docs/testing.md).
2. Inspect the actual Git diff and relevant surrounding code. Treat the
   implementation agent's summary as a claim to verify, not evidence.
3. Check requirement acceptance, public DSH API boundaries, Claude/Host
   ownership, error paths, cleanup, security, backwards compatibility,
   committed generated `lib/`, and documentation impacts.
4. Compare test claims with actual logs/CI. Distinguish automated test
   evidence from manual installed Desktop smoke testing.
5. Report findings in descending severity, with paths/lines and a concrete
   correction. State explicitly if a key surface was not inspected.
6. Output `PASS`, `CHANGES_REQUESTED` or `BLOCKED` with rationale.
   `PASS` does not authorize merging or publishing.
