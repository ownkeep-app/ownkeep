# keystash

An **offline-first, single-file, master-password-gated macOS app** — a keyboard-first **password
vault** and **command-line library** behind one Spotlight-style command bar, plus backup/restore and
configuration. No cloud, no database, no telemetry.

- **What & why:** [`spec.md`](spec.md)
- **Build order & status:** [`plan.md`](plan.md)
- **Rules for humans & AI agents:** [`AGENTS.md`](AGENTS.md), [`.cursor/rules/`](.cursor/rules/)

> Status: **Phase 11 (polish & ship)** — the encrypted vault core, all feature modules (passwords,
> commands, todos, subscriptions, finance), command bar, Dashboard, backup/restore, scheduler, and
> migration framework are in place. Current work is the polish pass — theming, empty states, toast
> feedback, keyboard-shortcut help, accessibility — ahead of signing and the v1.0 release (see
> `plan.md`).

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
icon's **Search ... / Dashboard / Exit** menu, or the hotkey to toggle the window. It hides on **Esc** or when it loses
focus.

## Using keystash

### First run & the Emergency Kit

On first run you set a **master password**. It encrypts the whole vault and is **never stored** — so
if you forget it, the only other way in is the **recovery code** shown once during onboarding as your
**Emergency Kit**.

- The recovery code is a random 12-word phrase that unlocks the entire vault, so store it **offline**
  (printed, or in a separate password manager) and **never beside the vault file**.
- Unlocking with the recovery code forces you to set a **new master password** on the spot.
- You can regenerate the Emergency Kit anytime from **Settings** (this re-wraps the recovery key; the
  old code stops working).

The vault lives at `~/Library/Application Support/com.shaojiang.keystash/vault.dat`
(`vault-dev.dat` in dev builds), outside the app bundle — see `spec.md` §3.2 and §4.

### Keyboard shortcuts

keystash is keyboard-first. Press **`⌘H`** on either surface to open the in-app shortcut cheat
sheet (also reachable from the Help row in the Dashboard sidebar). The essentials:

| Where | Keys | Action |
|---|---|---|
| Anywhere | `⌘⇧Space` | Summon the command bar |
| Anywhere | `⌘⇧D` | Toggle the Dashboard window |
| Anywhere | `⌘H` | Show keyboard shortcuts |
| Anywhere | `⌘/` | About keystash |
| Command bar | `⌥⇧1`–`⌥⇧9` | Run a result's primary action (e.g. copy password) |
| Command bar | `⌥⌘1`–`⌥⌘9` | Copy a command's raw template |
| Command bar | `Esc` | Hide the launcher |
| Dashboard | `⌥⇧1`–`⌥⇧9` / `↑ ↓` | Switch modules in the sidebar |

Copy and clipboard actions confirm with a toast; secret copies note when the clipboard auto-clears.

### Theme

Light / dark / system and the accent color are set in **Settings → Appearance** and apply live.

### Upgrading & the migration guide

keystash upgrades by **manual replacement** — download a new `.dmg` and drag the new app over the old
one. Your data is untouched because the vault lives outside the app bundle.

When a new build introduces a data-shape change, opening your existing vault shows a **migration
guide** before anything is written: it summarizes added fields, shows renamed paths (`old → new`), and
lists removals **in red as data loss**. You then choose to:

- **Accept & upgrade** — writes an automatic pre-migration backup, applies the migration, and
  continues; or
- **Reject** — **Back up & quit**, **Erase & start fresh** (danger, irreversible), or **Quit**
  untouched.

Migrations are forward-only, so an older app refuses a migrated vault — to roll back, restore the
pre-migration backup with the older build. Full rules: `spec.md` §11.

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
  use the tray's **Search ...**.
- **`Port 1420 is already in use`** — another Vite/keystash dev server is running; stop it or free the
  port (the dev server uses a fixed port on purpose).
- **First `cargo`/Tauri build is slow** — the Rust core and Tauri dependencies compile from source
  the first time; subsequent builds are incremental.

## Layout

```
keystash/
├── src/            # React + TypeScript front-end (UI only; no secrets)
├── src-tauri/      # Rust core (crypto, storage, concealed clipboard, scheduler)
├── spec.md         # product & technical spec
├── plan.md         # phased development plan
└── AGENTS.md       # AI-agent rules (also read by Codex, Claude, Cursor)
```
