---
name: plan-feature
description: Plan a keystash feature or spec section into ordered, phase-aligned tasks. Use explicitly with $plan-feature when you want planning before implementation.
---

Plan the requested keystash work without implementing it.

## Input

Use the user's prompt as the feature request. If the prompt gives no target, use the current incomplete phase in `plan.md`.

## Required context

Read these files before deciding anything:

1. `AGENTS.md`
2. `.cursor/rules/core-development-principles.mdc`
3. `spec.md`
4. `plan.md`

## Workflow

1. Identify the smallest feature, phase, or spec section covered by the request.
2. Check the request against the keystash non-negotiables:
   - Offline-only runtime.
   - Secrets stay in the Rust core, never in the WebView.
   - One encrypted file, no database.
   - Feature-module registry architecture.
3. Locate the current `plan.md` phase and dependency chain. If the requested work belongs to a later phase, say that clearly and propose how to defer it or update the plan.
4. Produce an ordered task list with acceptance criteria and verification steps. Keep the tasks small enough that `$implement` can pick one up directly.
5. Edit `plan.md` only when the plan itself needs to change. If the request changes documented product behavior or scope, also update `spec.md` in the same change.

## Output

Return:

- The target phase or spec section.
- Any conflicts or assumptions.
- The ordered implementation tasks.
- The tests or checks required for completion.

Do not write application code in this skill.
