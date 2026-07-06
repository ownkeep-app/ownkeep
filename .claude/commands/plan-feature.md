---
description: Turn a keystash spec section or feature request into ordered, phase-aligned tasks.
argument-hint: "[spec section, phase, or feature request]"
---

Plan the requested keystash work without implementing it.

Request:

```
$ARGUMENTS
```

## Required context

Read these files before deciding anything:

1. `AGENTS.md`
2. `.cursor/rules/core-development-principles.mdc`
3. `spec.md`
4. `plan.md`

## Workflow

1. Identify the smallest feature, phase, or spec section covered by the request. If the request is empty, use the current incomplete phase in `plan.md`.
2. Check the request against the keystash non-negotiables:
   - Offline-only runtime.
   - Secrets stay in the Rust core, never in the WebView.
   - One encrypted file, no database.
   - Feature-module registry architecture.
3. Locate the current `plan.md` phase and dependency chain. If the requested work belongs to a later phase, say that clearly and propose how to defer it or update the plan. Do not silently jump ahead.
4. Produce an ordered task list with acceptance criteria and verification steps. Keep the tasks small enough that `/implement` can pick one up directly.
5. Edit `plan.md` only when the plan itself needs to change. If the request changes documented product behavior or scope, also update `spec.md` in the same change.

## Output

Return:

- The target phase or spec section.
- Any conflicts or assumptions.
- The ordered implementation tasks.
- The tests or checks required for completion.

Do not write application code in this command.
