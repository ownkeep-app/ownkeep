---
name: implement
description: Implement one scoped keystash task using the spec, plan, and core development principles. Use explicitly with $implement.
---

Implement one scoped keystash task.

## Input

Use the user's prompt as the implementation target. If no target is provided, choose the next unchecked task from the current `plan.md` phase.

## Required context

Read these files before editing:

1. `AGENTS.md`
2. `.cursor/rules/core-development-principles.mdc`
3. `spec.md`
4. `plan.md`

## Guardrails

- Stay within the current `plan.md` phase unless the user explicitly asks to update the plan.
- If the requested change conflicts with `spec.md` or `plan.md`, stop, cite the conflict, explain the tradeoff, and ask for explicit confirmation.
- Preserve the non-negotiables: offline-only runtime, secrets in Rust, one encrypted file, and the feature-module registry.
- Keep changes small and direct. Prefer existing patterns over new abstractions.
- Separate pure logic from UI and side effects so the Vitest and Rust test strategy in `spec.md` section 2.2 stays practical.
- Update `spec.md` or `plan.md` in the same change if behavior, scope, or phase commitments change.

## Implementation flow

1. Confirm the target task and the files likely to change.
2. Inspect the relevant code or docs before editing.
3. Make the smallest coherent implementation.
4. Add or update focused tests when code changes.
5. Run the relevant checks:
   - Frontend: `pnpm test` when `package.json` exists and the change touches TS/React logic.
   - Rust: `cargo test` in the Rust crate when `Cargo.toml` exists and the change touches Rust or crypto/storage behavior.
   - Docs-only or harness-only changes: verify the files and links directly.
6. Summarize what changed, which checks ran, and anything still risky.

When implementation is complete, run `$verify` as a separate evaluator pass before committing.
