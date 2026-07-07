---
name: verify
description: Run keystash's independent read-only verifier pass against the current diff. Use explicitly with $verify after $implement or before commit.
---

Verify the current keystash work without editing files.

## Input

Use the user's prompt as optional target or acceptance criteria. If no target is provided, verify the current diff.

## Workflow

1. Spawn a Codex subagent using the project custom agent named `verifier`.
2. Ask it to evaluate the current diff against:
   - `AGENTS.md`
   - `.cursor/rules/core-development-principles.mdc`
   - `spec.md`
   - `plan.md`
3. Require it to check migration-guide maintenance for any vault-format, module data-shape, settings-key, schema-version, app-version, backup/restore, or migration-registry change since the latest `v*` release tag.
4. Require it to stay read-only. If spawning the `verifier` subagent is unavailable, perform the same checks yourself in read-only mode and state that fallback clearly.

## Expected response

Report:

- `VERDICT: PASS`, `VERDICT: FAIL`, or `VERDICT: NEEDS-MANUAL`.
- Scope checked.
- Tests or commands run, with results.
- Blocking findings first, with file and line references when available.
- Residual risks or skipped checks.

If the verdict is not `PASS`, do not fix the issues inside this skill. Return the next recommended `$implement` target instead.
