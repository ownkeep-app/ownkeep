<div align="center">

<img src="docs/media/icon.png" width="96" alt="OwnKeep">

# OwnKeep

### One hotkey for the things you shouldn't lose

Your shell incantations, your passwords, your renewal dates — behind a single Spotlight-style
bar, in one encrypted file on your own Mac. No cloud, no account, no telemetry.

[![Download](https://img.shields.io/github/v/release/ownkeep-app/ownkeep?label=download&style=for-the-badge&color=4A5AE8)](https://github.com/ownkeep-app/ownkeep/releases/latest)

[![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/macOS-13%2B-black?logo=apple&logoColor=white)](https://github.com/ownkeep-app/ownkeep/releases/latest)
[![Universal 2](https://img.shields.io/badge/build-Universal%202-lightgrey)](https://github.com/ownkeep-app/ownkeep/releases/latest)
[![Notarized](https://img.shields.io/badge/Apple-notarized-success)](SECURITY.md)
[![Coverage](https://img.shields.io/badge/coverage-%3E95%25-brightgreen)](#test--quality)
[![Website](https://img.shields.io/badge/ownkeep.app-4A5AE8)](https://ownkeep.app)

<img src="docs/media/command-bar.gif" width="720" alt="Typing in the OwnKeep command bar: fuzzy search finds a docker command, a numbered hotkey fills in its placeholders and copies it">

</div>

---

## What it is

You already have somewhere to put passwords. You probably don't have anywhere good to put the
`docker run -p {{port}}:{{port}} {{image}}` you rewrite from memory every few weeks, or the date your
domain renews. OwnKeep puts all of it behind `⌘⇧Space`.

- **⌨️ One bar for everything.** Fuzzy search ranked by frecency — the things you actually use surface first. `⌥⇧1`–`⌥⇧9` runs a result's primary action without your hands leaving the keyboard.
- **📋 A command library that fills itself in.** Snippets use `{{placeholder}}` markers; picking one prompts for the values and copies the finished command. Syntax-highlighted, and never truncated at the first blank.
- **🔐 A real vault underneath.** One file, encrypted with XChaCha20-Poly1305 under an Argon2id-derived key. Secrets stay in the Rust core and never enter the WebView; copies go to the pasteboard as *concealed*, so clipboard-history tools skip them, and auto-clear.
- **🧩 Modules you can switch off.** Passwords and commands, plus todos, subscriptions, and finance. Each one toggles from Settings with its data preserved.
- **✈️ Genuinely offline.** No network access at runtime. Not "privacy-respecting cloud" — no cloud.
- **👆 Touch ID, optionally.** A shortcut, never a replacement: the master password and recovery code always unlock, so you can't get locked out by a fingerprint change.

**Not** a 1Password replacement, and not trying to be: no sync, no browser autofill, no TOTP, no
import from other managers. If you want those, use KeePassXC or Bitwarden — OwnKeep exists for the
overlap between a vault and a launcher.

## Install

[**Download the latest `.dmg`**](https://github.com/ownkeep-app/ownkeep/releases/latest) — Universal
2, macOS 13+, about 12 MB.

Open the DMG, drag OwnKeep to Applications, launch it. macOS will ask for **Accessibility**
permission so the global hotkey works system-wide; OwnKeep then lives in the menu bar with no Dock
icon.

Releases are signed with a Developer ID certificate, built with hardened runtime, and notarized by
Apple — so Gatekeeper opens it without a warning. Verify that yourself before you trust it with
anything:

```bash
spctl -a -vvv -t open --context context:primary-signature OwnKeep_1.2.0_universal.dmg
# accepted
# source=Notarized Developer ID
```

Or build it from source — see [Stack](#stack), [Prerequisites](#prerequisites), and [Setup](#setup) below.

## Screenshots

| Command bar | Dashboard |
|---|---|
| <img src="docs/media/command-bar.png" alt="The OwnKeep command bar showing ranked results"> | <img src="docs/media/dashboard.png" alt="The OwnKeep Dashboard with the module sidebar and a list view"> |
| **Lock screen** | **Settings** |
| <img src="docs/media/lock-screen.png" alt="The OwnKeep lock screen with master password and Touch ID"> | <img src="docs/media/settings.png" alt="OwnKeep settings showing appearance and security options"> |

## Security

The whole vault is one AEAD-encrypted file; the master password is never stored and cannot be
recovered. [**SECURITY.md**](SECURITY.md) documents the exact construction — Argon2id parameters,
the three-way envelope wrap, the Touch ID key's Keychain attributes — along with what OwnKeep
deliberately does **not** do, including the fact that it has had no third-party audit. Read it before
you put anything important in here.

Found a vulnerability? [Report it privately](https://github.com/ownkeep-app/ownkeep/security/advisories/new).

## Documentation

- **What & why:** [`spec.md`](spec.md) · **Build order & status:** [`plan.md`](plan.md)
- **Contributing:** [`CONTRIBUTING.md`](CONTRIBUTING.md) · **Releasing:** [`RELEASING.md`](RELEASING.md)
- **Signing & Touch ID on macOS:** [`code-signing.md`](code-signing.md)
- **Rules for humans & AI agents:** [`AGENTS.md`](AGENTS.md), [`.cursor/rules/`](.cursor/rules/)

> **Status:** v1.2 shipped — signed, notarized, Touch ID live. The encrypted vault core, every
> feature module, the command bar, Dashboard, backup/restore, scheduler, and migration framework are
> all in place (see [`plan.md`](plan.md)).

---

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

## Using OwnKeep

### First run & the Emergency Kit

On first run you set a **master password**. It encrypts the whole vault and is **never stored** — so
if you forget it, the only other way in is the **recovery code** shown once during onboarding as your
**Emergency Kit**.

- The recovery code is a random 12-word phrase that unlocks the entire vault, so store it **offline**
  (printed, or in a separate password manager) and **never beside the vault file**.
- Unlocking with the recovery code forces you to set a **new master password** on the spot.
- You can regenerate the Emergency Kit anytime from **Settings** (this re-wraps the recovery key; the
  old code stops working).

The vault lives at `~/Library/Application Support/com.shaojiang.ownkeep/vault.dat`
(`vault-dev.dat` in dev builds), outside the app bundle — see `spec.md` §3.2 and §4.

### Keyboard shortcuts

OwnKeep is keyboard-first. Press **`⌘H`** on either surface to open the in-app shortcut cheat
sheet (also reachable from the Help row in the Dashboard sidebar). The essentials:

| Where | Keys | Action |
|---|---|---|
| Anywhere | `⌘⇧Space` | Summon the command bar |
| Anywhere | `⌘⇧D` | Toggle the Dashboard window |
| Anywhere | `⌘H` | Show keyboard shortcuts |
| Anywhere | `⌘/` | About OwnKeep |
| Command bar | `⌥⇧1`–`⌥⇧9` | Run a result's primary action (e.g. copy password) |
| Command bar | `⌥⌘1`–`⌥⌘9` | Copy a command's raw template |
| Command bar | `Esc` | Hide the launcher |
| Dashboard | `⌥⇧1`–`⌥⇧9` / `↑ ↓` | Switch modules in the sidebar |

Copy and clipboard actions confirm with a toast; secret copies note when the clipboard auto-clears.

### Theme

Light / dark / system and the accent color are set in **Settings → Appearance** and apply live.

### Upgrading & the migration guide

OwnKeep upgrades by **manual replacement** — download a new `.dmg` and drag the new app over the old
OwnKeep app. Your data is untouched because the vault lives outside the app bundle.

Existing `.dat` backups remain restorable regardless of their filename prefix. After upgrading to
v1.2, regenerate the Emergency Kit once from Settings to move its recovery wrap to the current
OwnKeep derivation context; the v1.2 reader still accepts the existing code until you do.

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
  Accessibility → enable OwnKeep (or your terminal, in dev). The app is designed to also work from
  the tray if the permission is denied.
- **Window vanished** — that's the launcher behavior (hide on blur/Esc). Press `Cmd+Shift+Space` or
  use the tray's **Search ...**.
- **`Port 1420 is already in use`** — another Vite/OwnKeep dev server is running; stop it or free the
  port (the dev server uses a fixed port on purpose).
- **First `cargo`/Tauri build is slow** — the Rust core and Tauri dependencies compile from source
  the first time; subsequent builds are incremental.

## Layout

```
ownkeep/
├── src/            # React + TypeScript front-end (UI only; no secrets)
├── src-tauri/      # Rust core (crypto, storage, concealed clipboard, scheduler)
├── spec.md         # product & technical spec
├── plan.md         # phased development plan
└── AGENTS.md       # AI-agent rules (also read by Codex, Claude, Cursor)
```

## Contributing

Issues and PRs are welcome — please read [`CONTRIBUTING.md`](CONTRIBUTING.md) first. OwnKeep is
spec-driven with a hard >95% coverage gate on both surfaces, and it has deliberate non-goals, so a
quick issue before you write code saves everyone an evening.

## License

[GPL-3.0-or-later](LICENSE). You can read it, build it, fork it, and run it however you like; if you
distribute a modified version, it stays open under the same terms.
