---
name: verify
description: Run keystash's independent read-only verifier pass against the current diff. Use after /implement or before commit.
argument-hint: "[optional target or acceptance criteria]"
disable-model-invocation: true
allowed-tools: Agent(verifier), Read, Glob, Grep, Bash
---

Verify the current keystash work without editing files.

Target or acceptance criteria:

```
$ARGUMENTS
```

Use the `verifier` subagent for this pass. Give it the target above, the current repository state, and the requirement that it evaluate the diff against `AGENTS.md`, `.cursor/rules/core-development-principles.mdc`, `spec.md`, and `plan.md`.

The verifier must be independent and read-only. Do not modify files during this skill. If the Agent tool or the `verifier` subagent is unavailable, perform the same checks yourself in read-only mode and state that fallback clearly.

## Expected response

Report:

- `VERDICT: PASS`, `VERDICT: FAIL`, or `VERDICT: NEEDS-MANUAL`.
- Scope checked.
- Tests or commands run, with results.
- Blocking findings first, with file and line references when available.
- Residual risks or skipped checks.

If the verdict is not `PASS`, do not fix the issues inside this skill. Return the next recommended `/implement` target instead.
