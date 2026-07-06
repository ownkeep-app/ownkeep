# AGENTS.md — keystash

keystash is an **offline-first, single-file, master-password-gated macOS app** (Tauri 2 + React +
TypeScript + Rust) whose key features are a **password vault** and a **command-line library**, plus
backup/restore and configuration. Full details: [`spec.md`](spec.md). Build order: [`plan.md`](plan.md).

## Read before writing code

1. **[`.cursor/rules/core-development-principles.mdc`](.cursor/rules/core-development-principles.mdc)** — the Core Development Principles (KISS, DRY, YAGNI, Declarative-over-Imperative, SRP) + clean-code baseline. Applies to **all** code. Read and follow it.
2. **[`spec.md`](spec.md)** — what to build and why (features, the feature-module architecture, data model, security model).
3. **[`plan.md`](plan.md)** — the **current phase** and its exit criteria. Work the current phase; don't jump ahead.

## Stay on track (guardrail)

- Align every change with `spec.md` and the **current `plan.md` phase**.
- Honor the non-negotiables from `spec.md`: **offline-only** (no network at runtime), **secrets stay in the Rust core** (never in the WebView), **one encrypted file** (no database), and the **feature-module registry** architecture.
- If a request conflicts with `spec.md`/`plan.md`, **flag it, cite the section, explain the tradeoff, and proceed only after explicit confirmation** — don't silently deviate.
- If a change alters documented behavior or scope, **update `spec.md`/`plan.md` in the same change**.

Keep rules general; concrete stack, versions, and per-module details live in `spec.md`.
