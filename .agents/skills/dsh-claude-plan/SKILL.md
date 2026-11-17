---
name: dsh-claude-plan
description: Analyze a change to the SophiaData dsh-claude plugin before development, checking the active Aegis architecture baseline, ownership, implementation risks and measurable acceptance criteria.
---

# Plan a dsh-claude change

1. Read [repository rules](../../../AGENTS.md) and
   [development workflow](../../../docs/development.md).
2. Read the active architecture reference, not historical implementation plans
   as if they were current instructions.
3. Locate affected source, public DSH APIs, existing tests and user-visible
   contracts. Explicitly separate desired behavior from assumptions.
4. Classify baseline conflicts as design defect, implementation drift,
   missing authority or aligned (per Aegis governance).
5. Produce: motivation, scope, non-goals, file-level approach, failure cases,
   compatibility risks, test plan, manual smoke needs, and acceptance checklist.
6. Do not edit source or claim verification during planning; stop and seek
   authorization for architecture or production-impacting decisions.
