# keystash

An **offline-first, single-file, master-password-gated macOS app** — a keyboard-first **password
vault** and **command-line library** behind one Spotlight-style command bar, plus backup/restore and
configuration. No cloud, no database, no telemetry.

- **What & why:** [`spec.md`](spec.md)
- **Build order & status:** [`plan.md`](plan.md)
- **Rules for humans & AI agents:** [`AGENTS.md`](AGENTS.md), [`.cursor/rules/`](.cursor/rules/)

> Status: **Phase 0 (shell)** — the app boots to an empty command bar, lives in the menu bar, and is
> summoned by a global hotkey. Crypto, the vault, and modules land in later phases (see `plan.md`).

## Stack

Tauri 2 (Rust core) · React 18 + TypeScript (Vite) · Tailwind CSS + shadcn/ui + Lucide · Zustand ·
Vitest + React Testing Library (frontend) · `cargo test` (Rust). See `spec.md` §2.

## Prerequisites

- **macOS 13+** (Apple Silicon or Intel)
- **Node.js ≥ 20** and **pnpm 10** (`corepack enable` provides pnpm)
- **Rust** (stable) via [rustup](https://rustup.rs)
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
pnpm coverage                 # Vitest with V8 coverage
pnpm typecheck                # tsc --noEmit
pnpm lint                     # ESLint
pnpm format                   # Prettier (write)   ·   pnpm format:check to verify
pnpm check                    # typecheck + lint + format:check + test

cd src-tauri && cargo test    # Rust core tests
```

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
