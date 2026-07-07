# keystash

An **offline-first, single-file, master-password-gated macOS app** — a keyboard-first **password
vault** and **command-line library** behind one Spotlight-style command bar, plus backup/restore and
configuration. No cloud, no database, no telemetry.

- **What & why:** [`spec.md`](spec.md)
- **Build order & status:** [`plan.md`](plan.md)
- **Rules for humans & AI agents:** [`AGENTS.md`](AGENTS.md), [`.cursor/rules/`](.cursor/rules/)

> Status: **Phase 2.2 (coverage gate)** — the encrypted vault core, app shell, Dashboard shell, and
> migration framework are in place; the current work is locking unit-test coverage above 95% before
> feature modules land (see `plan.md`).

## Stack

Tauri 2 (Rust core) · React 18 + TypeScript (Vite) · Tailwind CSS + shadcn/ui + Lucide · Zustand ·
Vitest + React Testing Library (frontend) · `cargo test` (Rust). See `spec.md` §2.

## Prerequisites

- **macOS 13+** (Apple Silicon or Intel)
- **Node.js ≥ 20** and **pnpm 10** (`corepack enable` provides pnpm)
- **Rust** (stable) via [rustup](https://rustup.rs)
- **Rust coverage tool:** `cargo install cargo-llvm-cov` (needed for `pnpm coverage:rust`)
- **Xcode Command Line Tools**: `xcode-select --install`

## Setup

```bash
pnpm install
```

## Develop

```bash
pnpm dev          # Tauri dev: Rust core + Vite front-end with hot reload
pnpm dev:web      # front-end only (Vite at http://localhost:1420), no Rust shell
```

On first launch, macOS will ask you to grant **Accessibility** permission so the global hotkey
(`Cmd+Shift+Space`) works system-wide. The app runs in the **menu bar** (no Dock icon); use the tray
icon's **Show / Quit** menu, or the hotkey to toggle the window. It hides on **Esc** or when it loses
focus.

## Test & quality

```bash
pnpm test                     # Vitest (front-end unit tests)
pnpm coverage                 # Vitest with V8 coverage; fails below 95%
pnpm coverage:rust            # cargo llvm-cov; fails below 95% Rust-core line coverage
pnpm coverage:all             # front-end + Rust coverage gates
pnpm typecheck                # tsc --noEmit
pnpm lint                     # ESLint
pnpm format                   # Prettier (write)   ·   pnpm format:check to verify
pnpm check                    # typecheck + lint + format:check + test

cd src-tauri && cargo test    # Rust core tests
```

Frontend coverage measures first-party application code (`src/**/*.{ts,tsx}`) and intentionally
excludes bootstrap glue, type-only files, test setup, and copied shadcn/ui primitives. The Rust
coverage gate measures the testable core modules with `cargo llvm-cov --fail-under-lines 95` and
excludes Tauri IPC/bootstrap glue (`commands.rs`, `lib.rs`, `main.rs`), which need later integration
coverage rather than unit coverage.

## Production build

```bash
pnpm build        # builds the front-end and bundles the macOS app
```

Output lands in `src-tauri/target/release/bundle/` (`.app` and `.dmg`). Signing & notarization are
deferred until the app is a daily driver (see `spec.md` §12); early builds are unsigned, so Gatekeeper
may warn on first open.

## Troubleshooting

- **Global hotkey does nothing** — grant Accessibility: System Settings → Privacy & Security →
  Accessibility → enable keystash (or your terminal, in dev). The app is designed to also work from
  the tray if the permission is denied.
- **Window vanished** — that's the launcher behavior (hide on blur/Esc). Press `Cmd+Shift+Space` or
  use the tray's **Show**.
- **`Port 1420 is already in use`** — another Vite/keystash dev server is running; stop it or free the
  port (the dev server uses a fixed port on purpose).
- **First `cargo`/Tauri build is slow** — the Rust core and Tauri dependencies compile from source
  the first time; subsequent builds are incremental.

## Layout

```
keystash/
├── src/            # React + TypeScript front-end (UI only; no secrets)
├── src-tauri/      # Rust core (shell now; crypto, storage, scheduler later)
├── spec.md         # product & technical spec
├── plan.md         # phased development plan
└── AGENTS.md       # AI-agent rules (also read by Codex, Claude, Cursor)
```
