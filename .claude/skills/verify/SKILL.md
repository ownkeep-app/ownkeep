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

Require the verifier to run `pnpm check` and include the result. If `pnpm check` has any errors, the verdict must be `FAIL` (never `PASS`).

Require the verifier to check migration-guide maintenance for any vault-format, module data-shape, settings-key, schema-version, app-version, backup/restore, or migration-registry change since the latest `v*` release tag. For every such change it must confirm three things (or fail):

1. **Migration guide entry** — a matching, typed step in the migration registry (`added` / `renamed` / `removed` / `transformed`), with removals flagged as data loss and renames showing `old -> new`.
2. **`package.json.version` current-release check** — the change belongs to the working `package.json.version` release (product format `main.minor`, injected as `APP_VERSION`), and `APP_SCHEMA_VERSION` is bumped in the same change when the data shape moved.
3. **Tests** — coverage for the change: the migration transform and, where user-facing, the generated guide.

If a change genuinely needs no migration, the diff must say why.

The verifier must be independent and read-only. Do not modify files during this skill. If the Agent tool or the `verifier` subagent is unavailable, perform the same checks yourself in read-only mode and state that fallback clearly.

## Expected response

Report:

- `VERDICT: PASS`, `VERDICT: FAIL`, or `VERDICT: NEEDS-MANUAL`.
- Scope checked.
- Tests or commands run, with results.
- Blocking findings first, with file and line references when available.
- Residual risks or skipped checks.

If the verdict is not `PASS`, do not fix the issues inside this skill. Return the next recommended `/implement` target instead.

If `pnpm check` is not clean, the verdict must not be `PASS`.
