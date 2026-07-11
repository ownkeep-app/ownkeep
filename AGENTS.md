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
- If a change alters the vault/data shape (settings keys, module slices, schema/container versions, stored JSON paths, backup/restore behavior), **update the migration guide / migration registry in the same change** and make `$verify` confirm it against the latest `v*` release tag.
- Keep **unit-test coverage >95%** on both surfaces (Vitest for the frontend, `cargo` coverage for the Rust core). `$verify` enforces the bar as a PASS gate; bringing the existing code to it (and wiring the tooling) is plan **Phase 2.2** (see `spec.md` §2.2).

## AI-assisted development workflow

Use the lightweight spec-driven loop:

1. **Plan** — turn a spec section or feature request into ordered, phase-aligned tasks.
2. **Implement** — do one scoped task from the current `plan.md` phase.
3. **Verify** — run an independent read-only check against the diff before committing.

Tool-specific entry points:

- **Codex:** use repo skills from `.agents/skills/` with `$plan-feature`, `$implement`, `$verify`, and `$coverage` (or open `/skills` and select them). Codex does **not** load Claude slash commands like `/plan-feature`. The verifier agent is configured at `.codex/agents/verifier.toml`.
- **Claude Code:** use the matching project commands in `.claude/commands/` (`/plan-feature`, `/implement`, `/verify`, `/coverage`) plus `.claude/agents/verifier.md`.
- **Cursor:** follows `.cursor/rules/core-development-principles.mdc`; use `/coverage` (`.cursor/skills/coverage`) to measure and fix the >95% bar; ask it to follow the same Plan -> Implement -> Verify loop explicitly.

Keep rules general; concrete stack, versions, and per-module details live in `spec.md`.
