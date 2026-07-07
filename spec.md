# keystash — Product / Technical Spec

> A single-file, master-password-gated, keyboard-first macOS app that unifies your
> **passwords** and **dev command snippets** — plus optional trackers (todos,
> subscriptions, finance) — behind one Spotlight-style search bar. Fully offline.

**Name:** keystash
**Target platform:** macOS 13+ (Apple Silicon + Intel)
**Author:** Shaojiang
**Status:** Draft v2.3 (adds manual-upgrade, release-version, migration-guide, and data-migration rules)
**Last updated:** 2026-07-07

---

## 0. What changed in v2 (audit summary)

This spec was benchmarked against the leading offline/keyboard-first tools. Key changes from v1:

| Area | v1 | v2 (this doc) | Why |
|---|---|---|---|
| **Architecture** | Fixed feature set | **Feature-module registry** — small core + pluggable modules toggled via config | Your requirement: add/enable/disable features freely |
| **Recovery** | 3 security questions | **Random recovery code / emergency kit** (1Password-style) | Security answers are a guessable "second password"; mainstream managers avoid them |
| **Command copy** | `[ ]` strip-from-first-placeholder | **Interactive fill-in** with `{{name}}` placeholders (Warp/Raycast style) | Truncation breaks when a placeholder isn't last (`docker run -p [port]:[port] [img]`) |
| **Search ranking** | Fuzzy only | Fuzzy **+ frecency** (frequency + recency) | How Raycast/Alfred actually rank; cheap, big usability win |
| **MVP scope** | 6 features at once | **Core = passwords + commands + bar + backup + settings**; trackers are later modules | "Running on macOS ASAP"; "simple for a sole dev" |
| **Modules kept** | subscriptions, finance, calendar, notes | **todos, subscriptions, finance** (calendar/notes → future candidates) | Your selection |
| **Stack trim** | +CodeMirror, react-markdown, rehype-sanitize | Dropped from MVP (move to a future Notes module); keep Shiki, uPlot | Fewer moving parts; markdown editor isn't needed without Notes |
| **Browsing** *(v2.1)* | Command bar only | **+ a Dashboard** — left sidebar + full-content right pane, registry-driven | See and manage *all* of each module's content, not just quick-copy |
| **UI kit** *(v2.2)* | Hand-rolled + Tailwind | **shadcn/ui** (à la carte, Radix + Tailwind) + **Lucide** icons; `command` powers the bar | Accessible, clean, source you own/audit — good for a secrets app |
| **Testing** *(v2.2)* | "unit-tested" (unspecified) | **Vitest + React Testing Library** (frontend) · **`cargo test` + proptest** (Rust) | Concrete Vite-native stack; crypto invariants get property tests |
| **Upgrades** *(v2.3)* | Unspecified | **Manual `.dmg` replacement + user-aware migration guide** | Replacing the app reuses the old vault, while schema changes stay explicit and recoverable |

Confirmed unchanged: **Tauri 2 + React + TS + Rust**; Argon2id + XChaCha20-Poly1305; one
encrypted file, no database; concealed-clipboard copy; auto-lock; native notifications.

---

## 1. Overview & Design Philosophy

keystash is a personal, offline-first "second brain for dangerous-to-lose stuff." Everything
lives in **one encrypted file** — no database, no cloud, no telemetry. The app opens on a global
hotkey to a single search box; you type, results appear one-per-line, and a numbered hotkey copies
the right value instantly. A companion **Dashboard window** (left sidebar + full-content pane)
lets you browse and manage everything in each module when you want more than quick-copy.

**Six principles, in priority order:**

1. **Private by default** — plaintext never touches disk; the whole vault is one AEAD-encrypted blob; secrets stay in the Rust core, out of the WebView.
2. **Keyboard-first** — every core action reachable without the mouse; the search bar is the home screen.
3. **Fast** — sub-second cold start to search box (after unlock); search is in-memory and instant.
4. **Elegant & minimal** — two focused surfaces (a quick command bar + a browsable Dashboard), calm visual design, light/dark.
5. **Yours to customize** — hotkeys, lead times, categories, and copy behavior are all configurable.
6. **Modular** — features are self-contained modules you can enable/disable/add without touching the core. *(New in v2 — this is the backbone of the whole design; see §3.4.)*

**Non-goals (v1):** cross-device sync, iOS/Windows apps, team sharing, browser auto-fill /
auto-type, TOTP/2FA generation, importing from other password managers. All possible later as
modules; none in scope for v1.

---

## 2. Tech Stack — **Tauri 2 + React + TypeScript + Rust** (confirmed)

Best fit for a senior front-end dev building a tiny, fast, secure, native app. Research (2025–26)
strongly favors Tauri over Electron for a secrets app: **~8–10 MB installers vs ~150 MB**,
**30–50 MB RAM vs 150–300 MB**, capability-based security, and — critically — secrets can stay in
the Rust core, never entering the WebView (see §4.5).

| Layer | Choice | Why |
|---|---|---|
| Shell | **Tauri 2** | Tiny binaries, macOS system WebView (WKWebView), Rust backend for crypto, first-class macOS integration. |
| UI | **React 18 + TypeScript** | Leverages existing skills; huge ecosystem. |
| Styling | **Tailwind CSS** | Fast, clean, themeable; also the base for shadcn/ui. |
| Icons | **Lucide** (`lucide-react`) | Clean, minimal, tree-shakeable SVG set; bundled (offline); the icon set shadcn/ui uses by default. |
| UI components | **shadcn/ui** (Radix + Tailwind) | Accessible primitives **copied into your repo** (à la carte: button, input, table, dialog, sheet, select, switch, tabs, badge, dropdown-menu, tooltip, sonner). You own + can audit the source — ideal for a secrets app. |
| Command palette | shadcn **`command`** (`cmdk`) | Powers the command-bar shell + keyboard nav (§7.2); Fuse.js + frecency still rank (its built-in filter is disabled). |
| Testing (frontend) | **Vitest** + **React Testing Library** + `jsdom` | Vite-native, fast, Jest-compatible; tests pure module logic + critical components (§2.2). |
| Testing (Rust) | **`cargo test`** + **`proptest`** | Built-in unit tests + property tests for the crypto invariants (§2.2). |
| State | **Zustand** | Minimal, no boilerplate; good fit for the module registry. |
| Fuzzy search | **Fuse.js** | Client-side ranking over the in-memory index; combined with a frecency booster (§7.2). |
| Syntax highlighting | **Shiki** | VS Code-quality highlighting for command snippets. |
| Charts (finance) | **uPlot** | Tiny/fast; ideal for a single net-worth time-series line. *(Only loaded by the Finance module.)* |
| Crypto (Rust) | `argon2`, `chacha20poly1305`, `hkdf`, `sha2`, `rand`, `zeroize` | Argon2id KDF (password) + HKDF (recovery code) + XChaCha20-Poly1305 AEAD; zeroize keys on lock. |
| Global hotkey | `@tauri-apps/plugin-global-shortcut` | System-wide activation even when hidden. |
| Notifications | `@tauri-apps/plugin-notification` | Native notification center. |
| File I/O | `@tauri-apps/plugin-fs` + `plugin-dialog` | Single vault file; backup/restore pickers. |
| Single instance | `@tauri-apps/plugin-single-instance` | One running copy; re-invocation focuses the bar. |
| Menu-bar / tray | Tauri tray API + `ActivationPolicy::Accessory` | Keeps the scheduler alive; optional no-Dock-icon. |
| Concealed clipboard | **custom Rust** (objc2 / cocoa) | Tauri's clipboard plugin can't set `org.nspasteboard.ConcealedType`; ~20 lines of native code (§4.3). |

> **Deliberately NOT used:** `tauri-plugin-sql`, `tauri-plugin-store`, Stronghold — all introduce
> an on-disk store, violating "one encrypted file, no database." Persistence goes through a single
> custom encrypted container via the `fs` plugin. Stronghold was considered (Tauri's own
> recommendation for secrets) but its snapshot store conflicts with the single-file rule and adds
> complexity a sole dev doesn't need; the `argon2` + `chacha20poly1305` crates are simpler and give
> full control.

**Dropped from v1's stack** (re-add only if a Notes module lands): CodeMirror/Milkdown,
react-markdown, remark-gfm, rehype-sanitize.

### Why not the alternatives
- **Electron + React/TS** — fastest with pure JS, every lib works directly, but ~150 MB, higher RAM, and secrets live in the JS process. Conflicts with "simple, elegant, fast" and weakens the vault. Rejected.
- **Native Swift + SwiftUI** — most native, smallest footprint, cleanest hotkey/menu-bar story, but steepest ramp from front-end and you rebuild the highlight/chart stack. Rejected for time-to-first-version.

### 2.1 UI kit & theming — shadcn/ui + Lucide
- **shadcn/ui is not a runtime dependency** — its CLI copies component *source* into `src/components/ui/`, so you own and can audit every line (reassuring for a vault). Add only what you use: `npx shadcn@latest add button input table dialog sheet select switch tabs badge dropdown-menu tooltip command sonner`.
- **Runtime-offline:** the copied components pull only tiny local helpers (`class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss-animate`) + Radix primitives. The CLI needs the network *once at dev time*; **nothing networked at runtime** — honors offline-first. Vendor `components/ui/` into git.
- **Icons:** `lucide-react`, tree-shaken (import only the glyphs used), bundled into the app.
- **Theming ties into settings:** shadcn tokens are CSS variables (HSL) in `globals.css`. `settings.theme` (system/light/dark) toggles the `.dark` class; `settings.accent` maps to the `--primary` token — so "theme + accent" (§9) is a token swap, no component edits.
- **Where each is used:** `command` → the command bar (§7.2); `table` → dashboard `ListView`s (passwords, subscriptions, finance); `sheet` / `dialog` → slide-over detail/edit + the restore warning; `select` / `switch` / `tabs` → settings + enum command arguments; `sonner` → "copied" / "clipboard cleared" / error toasts; `badge` → tags / priority / auto-renew.

### 2.2 Testing strategy
Two test surfaces, matching the two-language architecture:

| Surface | Framework | Primary targets |
|---|---|---|
| **Frontend (TS/React)** | **Vitest** + **React Testing Library** + `@testing-library/user-event` + **jsdom** | Pure module logic (`buildIndex`, `{{ }}` placeholder parse/fill, fuzzy×frecency ranking, finance totals + FX, subscription cycle math, `collectReminders`, todo recurrence); behavior of critical views. Coverage via `vitest --coverage` (v8). |
| **Rust core** | **`cargo test`** (built-in) + **`proptest`** | Crypto invariants: envelope wrap/unwrap, both unlock paths recover the same DEK, tamper → AEAD fail, re-wrap after master change, atomic-write round-trip. Property tests fuzz random keys/inputs. |

- **Design for testability:** each module keeps its **pure logic separate from its React views** (e.g. `commands/placeholders.ts`, `finance/totals.ts`), so the highest-value tests need no DOM — a natural fit for the module registry.
- **Tauri IPC:** mock `@tauri-apps/api`'s `invoke` in Vitest (`vi.mock`) to test frontend flows without Rust; test the Rust command bodies directly with `cargo test`.
- **Definition of done:** a phase/module isn't complete until its logic tests pass; the crypto core (Phase 1) is strictest — property-tested **before** any real data is stored.
- **Coverage bar (>95%):** unit-test **line coverage must stay above 95% on both surfaces** — Vitest v8 (`pnpm coverage`) for the frontend and `cargo`-measured coverage (e.g. `cargo llvm-cov`) for the Rust core. `$verify` / `/verify` runs coverage and treats ≤95% (or a surface whose coverage cannot be measured) as a **blocking failure — never a `PASS`**. Bringing the existing code to the bar and wiring the enforcement (thresholds + tooling) is **Phase 2.2** (see `plan.md`); every phase after that keeps coverage above the bar.
- **Why Vitest over Jest:** Vite-native (Tauri uses Vite), Jest-compatible API, faster. `happy-dom` is a lighter alternative to `jsdom` if suite speed matters.
- **E2E (future, optional):** Tauri WebDriver via `tauri-driver` + WebdriverIO for full-app smoke tests — not needed for the MVP (see §14).

---

## 3. Architecture

### 3.1 Process model
- **Frontend (WebView):** all UI — search bar, list, detail/edit views, module panels, settings. Holds only **non-secret** data.
- **Rust core:** crypto (KDF, AEAD, envelope wrapping), file I/O, the notification scheduler, global-hotkey registration, and **all handling of secret values** (passwords) including concealed-clipboard writes.
- **Tray/menu-bar agent:** keeps running after the window hides so the scheduler can fire due-date/reminder notifications. Optionally an accessory (no Dock icon) app.

### 3.2 Storage model — one file, no database
- A single production file: `~/Library/Application Support/com.shaojiang.keystash/vault.dat`.
- Development builds (`tauri dev` / debug builds) use `~/Library/Application Support/com.shaojiang.keystash/vault-dev.dat` instead, so local development cannot accidentally read or mutate the production vault.
- Self-describing, versioned, **AEAD-encrypted** container (§4.2).
- **In memory after unlock:** the full decrypted model lives in the **Rust core**. The frontend receives a **redacted projection** (secrets stripped) for its search index and views. Secret fields are handed out only at the moment of an explicit copy action (§4.5).
- On every mutation: Rust re-encrypts and atomically writes (temp file → `fsync` → rename).

### 3.3 Data flow (unlock)
```
launch → read vault file header (`vault-dev.dat` in dev, `vault.dat` in release) → user enters master password
      → Rust: Argon2id(master, salt_master) = KEK_master
      → Rust: AEAD-unwrap DEK with KEK_master
      → Rust: AEAD-decrypt vault body with DEK  → in-memory model (stays in Rust)
      → frontend requests get_projection() → receives non-secret index; search bar ready
```

### 3.4 Feature-module registry (the backbone) — **new in v2**

The whole app is a **thin core + a set of modules**. The core knows nothing about "passwords" or
"todos" specifically; it iterates a registry. Adding a feature = writing one module and registering
it. Disabling a feature = flipping `enabled: false` (data is preserved, just hidden from the index,
nav, and scheduler).

**Core responsibilities (module-agnostic):** unlock/lock, the command bar + unified index,
settings shell, backup/restore, the notification scheduler loop, global hotkey, theming.

**A module is a self-contained unit that declares:**

```ts
interface FeatureModule<T = unknown> {
  id: string;                      // "passwords" | "commands" | "todos" | ...
  title: string;                   // display name in settings/nav
  icon?: ReactNode;
  enabledByDefault: boolean;
  scopePrefix?: string;            // command-bar scope, e.g. "p", "c", "t"
  secretFields?: (keyof T)[];      // fields Rust must redact + serve only via copy_secret (§4.5)

  createEmpty(): T[] | object;     // initial data slice for a fresh vault
  buildIndex(items: T[], ctx): IndexEntry[];   // → { id, type, searchString, displayLine, actions }

  ListView:   React.FC<{ items: T[] }>;        // dashboard right-pane: all of this module's content (§7.5)
  DetailView?: React.FC<{ item: T }>;          // optional — filled in each module's own phase
  EditView?:  React.FC<{ item?: T; onSave; onCancel }>;
  SettingsPanel?: React.FC;        // module-specific settings tab

  collectReminders?(items: T[], now: Date, settings): ReminderEvent[]; // scheduler hook (§8)
}
```

**Registration:**
```ts
// modules/index.ts — the only file you touch to add/remove a feature
export const MODULES: FeatureModule[] = [
  passwordsModule,      // core-ish, ships first
  commandsModule,       // core-ish, ships first
  todosModule,          // optional
  subscriptionsModule,  // optional
  financeModule,        // optional
  // future: calendarModule, notesModule
];
```

**How the core uses it:**
- **Unified index** = `flatMap(enabledModules, m => m.buildIndex(slice[m.id]))` → fed to Fuse.js + frecency.
- **Dashboard** = the sidebar lists one row per enabled module; selecting one renders its `ListView` in the right pane (§7.5).
- **Nav / settings tabs** = one entry per enabled module with a `SettingsPanel`.
- **Scheduler** = `flatMap(enabledModules, m => m.collectReminders?.(...))` → dedupe → notify.
- **Redaction** = Rust reads each module's `secretFields` to strip secrets from the projection.

**Data model shape follows the registry** — a map keyed by module id (§5), so a slice can be
added/removed without migrations touching other modules.

**Enable/disable UX:** Settings → Modules lists every registered module with a toggle. Disabling
hides it everywhere but keeps its data slice in the encrypted file (with a "delete data" option).

---

## 4. Security & Cryptography (critical)

keystash protects passwords and financial data, so crypto is a first-class concern.

### 4.1 Envelope encryption (password **or** recovery-code unlock)

A random **Data Encryption Key (DEK)** encrypts the vault. The DEK is *wrapped* twice — once by a
key derived from the master password, once by a key derived from a **randomly generated recovery
code** — so either path unlocks without ever storing the DEK in the clear.

**On first setup:**
1. Generate a random 256-bit `DEK`.
2. Encrypt the entire vault JSON with `DEK` using **XChaCha20-Poly1305** → `vault_ciphertext` (+ 192-bit nonce).
3. Derive `KEK_master = Argon2id(master_password, salt_master, params)`. *(Slow/memory-hard — the master password is human-chosen and low-entropy.)*
4. Generate a random **recovery code** (128-bit, rendered as a 12-word list or grouped Base32 — see §4.6). Derive `KEK_recovery = HKDF-SHA256(recovery_code, salt_recovery)`. *(Fast KDF is sufficient — the code is already high-entropy; no need to slow it with Argon2.)*
5. `wrapped_master = AEAD_encrypt(DEK, KEK_master)` and `wrapped_recovery = AEAD_encrypt(DEK, KEK_recovery)`.
6. Show the **Emergency Kit** (§4.6) once and persist the container (§4.2). **The recovery code is never stored.**

**Unlock path A (master password):** derive `KEK_master` → unwrap `DEK` → decrypt vault.
**Unlock path B (recovery code):** enter the code → derive `KEK_recovery` → unwrap `DEK` →
decrypt vault → **force setting a new master password** (re-derive `KEK_master` with a fresh
`salt_master`, re-wrap the DEK). The DEK and `vault_ciphertext` are unchanged. Optionally
regenerate the recovery code too.

**Wrong password/code** → wrong key → AEAD unwrap fails authentication → reject. No separate
password hash to store or leak; the AEAD tag *is* the verification.

### 4.2 On-disk container format (conceptual)
```jsonc
{
  "magic": "KSTH",
  "version": 2,
  "kdf":          { "alg": "argon2id", "mem_kib": 262144, "iterations": 3, "parallelism": 4 },
  "recovery_kdf": { "alg": "hkdf-sha256" },
  "salt_master":   "<base64>",
  "salt_recovery": "<base64>",
  "wrapped_master":   { "nonce": "<b64>", "ct": "<b64>" },   // encrypts the 32-byte DEK
  "wrapped_recovery": { "nonce": "<b64>", "ct": "<b64>" },   // encrypts the same DEK
  "vault":            { "nonce": "<b64>", "ct": "<b64>" }    // XChaCha20-Poly1305 over the model
}
```
> Argon2 params (256 MiB / 3 / 4) are generous for a desktop; tune down for older Intel Macs if
> unlock feels slow. No security-questions array — the recovery path stores nothing but a salt.

### 4.3 Runtime protections
- **Auto-lock:** wipe keys + in-memory plaintext after N minutes idle (default 1 hour; configurable in Settings — 5 / 15 / 30 minutes, 1 / 3 hours, or **never**) and optionally on window blur. Re-entry requires the master password. "Never" (`autoLockMinutes: 0`) keeps the vault unlocked until the user locks it manually or quits — a deliberate convenience/security trade-off surfaced in the UI.
- **Zeroize:** all key material and decrypted secrets zeroized (`zeroize`) on lock/quit.
- **Clipboard hygiene:** on copy of a secret, (a) auto-clear the pasteboard after N seconds (default 30), and (b) mark it **concealed/transient** (`org.nspasteboard.ConcealedType` + `TransientType`) so clipboard-history tools ignore it. *Requires ~20 lines of custom Rust (objc2/cocoa) — the Tauri clipboard plugin does not set these types.* *Caveat:* macOS Universal Clipboard/Handoff and some third-party managers may still capture — documented honestly in-app.
- **Failed-attempt backoff:** Argon2 is already slow; add optional exponential backoff after repeated failures.
- **Recovery-code custody:** the Emergency Kit warns the code unlocks the whole vault and must be stored offline (printed / in another password manager), never beside the vault file.

### 4.4 Backup encryption
A backup **is** the encrypted container — already safe at rest. No special export crypto: a backup
is a copy of the active vault file (`vault-dev.dat` in dev, `vault.dat` in release), openable only
with the same master password (or recovery code). See §11.

### 4.5 Frontend exposure hardening
- **Never load secret fields into the WebView by default.** The Rust core holds the decrypted model; it serves the frontend a projection with each module's `secretFields` redacted. A secret is returned **only** on an explicit copy action — Rust writes it straight to the concealed pasteboard and discards it; the value never enters JS.
- **Sanitize any future rendered markdown** (when a Notes module lands) with `rehype-sanitize`; disable raw HTML. *(No markdown rendering in v1.)*
- **Disable WebView devtools in production**; set a strict Content-Security-Policy.

### 4.6 Emergency Kit (recovery)
Shown once at setup and re-downloadable from Settings (regenerates a fresh code + re-wraps):
- **Recovery code**: 128-bit, rendered as **12 words** (EFF/BIP39-style wordlist, easy to transcribe) — or grouped Base32 `KSTH-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX` if you prefer.
- Includes app name + creation date + instructions. **Does not include the master password.**
- Offered as a printable / saveable card (PDF or plain text via the file dialog).

---

## 5. Data Model (single JSON document, encrypted as one blob)

Shape mirrors the module registry: shared `settings` + a `modules` map. Enabling/disabling a module
never migrates another module's slice.

```jsonc
{
  "meta": { "schemaVersion": 3, "appVersion": "0.1", "createdAt": "ISO", "updatedAt": "ISO" },

  "settings": {
    "globalHotkey": "Cmd+Shift+Space",       // activate/toggle the search window
    "dashboardHotkey": "Cmd+Shift+D",        // open/toggle the dashboard window
    "copyHotkey": { "modifiers": "Cmd", "keys": "1-9" },  // numbered copy
    "autoLockMinutes": 60,                    // 0 = never auto-lock
    "lockOnBlur": false,
    "clipboardClearSeconds": 30,
    "theme": "system",                        // system | light | dark
    "accent": "#4F7CFF",
    "resultLimit": 9,
    "modules": {                              // per-module enable flag + settings live here
      "passwords":     { "enabled": true },
      "commands":      { "enabled": true, "placeholderSyntax": "{{ }}", "defaultCopyMode": "fill" },
      "todos":         { "enabled": true,  "scopePrefix": "t", "defaultLeadMinutes": 30 },
      "subscriptions": { "enabled": true,  "scopePrefix": "s", "defaultLeadDays": 3 },
      "finance":       { "enabled": true,  "scopePrefix": "f", "baseCurrency": "USD", "fxRates": { "SGD": 0.74, "CNY": 0.14 } }
    }
  },

  "frecency": { /* itemId → { count, lastUsedAt } */ },   // command-bar ranking; non-secret

  "modules": {
    "passwords": [
      { "id": "uuid", "name": "GitHub", "username": "shao", "password": "secret",   // secretFields: ["password"]
        "loginUrl": "https://github.com/login", "recoveryUrl": "https://github.com/password_reset",
        "notes": "", "tags": ["dev"], "updatedAt": "ISO" }
    ],

    "commands": [
      { "id": "uuid", "category": "git", "title": "Delete a remote branch",
        "description": "Delete a branch on origin",
        "snippets": [ { "language": "bash", "code": "git push origin --delete {{branch}}" } ],
        "primaryCopyTemplate": "git push origin --delete {{branch}}",
        "arguments": [ { "name": "branch", "type": "text", "description": "branch name" } ],
        "tags": ["git", "branch"], "updatedAt": "ISO" }
    ],

    "todos": [
      { "id": "uuid", "title": "Renew passport", "notes": "", "done": false,
        "dueAt": "ISO|null", "notifyLeadMinutes": 30, "priority": "normal",  // low|normal|high
        "tags": ["life"], "recurrence": null, "updatedAt": "ISO" }
    ],

    "subscriptions": [
      { "id": "uuid", "service": "Linode", "url": "https://cloud.linode.com/account/billing",
        "amount": 20, "currency": "USD", "cycle": "monthly",   // weekly|monthly|yearly|custom
        "customIntervalDays": null, "nextDueDate": "ISO", "autoRenew": true,
        "notifyLeadDays": 3, "notes": "", "updatedAt": "ISO" }
    ],

    "finance": {
      "snapshots": [
        { "id": "uuid", "date": "2026-07-01",
          "entries": [
            { "place": "DBS",     "category": "bank",   "amount": 12000, "currency": "SGD" },
            { "place": "WeChat",  "category": "wechat", "amount": 800,   "currency": "CNY" },
            { "place": "Binance", "category": "crypto", "amount": 5000,  "currency": "USD" }
          ],
          "note": "Free text, e.g. paid annual insurance premium this month.",
          "computed": { "total": 0, "byCategory": {} }   // recomputed on save
        }
      ]
    }
  }
}
```

*(FX rates + baseCurrency live under `settings.modules.finance`. Future calendar/notes modules add
their own slice under `modules` with no impact on the above.)*

---

## 6. Feature Specifications

### CORE — ships in the first runnable version

#### F1 — Password vault (module `passwords`)
- Fields: **name** (memorable label), **username**, **password**, **login URL**, **recovery URL**, optional notes + tags.
- `secretFields: ["password"]` — the password is never sent to the WebView; it renders masked `••••••`.
- **Copy** pulls the value from Rust, writes it to a concealed pasteboard, schedules auto-clear. An explicit "reveal" toggle shows plaintext temporarily (fetched on demand, not held).
- Login/recovery URLs are click-to-open.
- **Benchmark:** matches KeePassXC's single-file model; XChaCha20-Poly1305 + Argon2id ≈ KeePassXC's ChaCha20 + Argon2id + Encrypt-then-MAC (AEAD gives us the MAC for free).
- **Acceptance:** create/edit/delete; copy password without it ever appearing in the DOM; masked by default; URLs open in browser.

#### F2 — Command library (module `commands`)
- Each command: a **title** ("Delete a remote branch"), a **category** (git/docker/mongo/…), optional description, and **one or more syntax-highlighted snippets** (Shiki).
- One-line searchable form: `"<category> command to <title>: <primaryCopyTemplate>"`, e.g. `"Git command to delete a remote branch: git push origin --delete {{branch}}"`.
- **Placeholders** use `{{name}}` (Warp-aligned). Names: `A-Za-z0-9_-`, not starting with a digit. Same name = same value (reused). Optional typed `arguments` (`text` | `enum` with `values`) enable dropdowns and validation (Warp-style).
- **Copy behavior (interactive fill-in — the confirmed default):**
  - No placeholders → copy immediately.
  - Has placeholders → open an inline mini-form (one field per unique placeholder; enum → dropdown), Tab/Shift-Tab to move, Enter copies the **completed** command. Handles placeholders anywhere in the string.
  - Secondary action **"copy raw"** (Opt+Enter, or Opt+Cmd+number in the bar) copies the template verbatim, placeholders intact, for quick terminal typing.
- **Benchmark:** Warp Workflows `{{arg}}` + Raycast snippet placeholders + navi/pet interactive fill.
- **Acceptance:** multi-line snippets highlight; a mid-string placeholder fills correctly; raw copy preserves `{{ }}`.

#### Command bar + numbered copy (F10) — see §7 (the heart of the app).

#### Master-password gate + recovery (F7)
- Every launch requires the **master password** before any decryption.
- If forgotten, enter the **recovery code** → recovery-path unlock → **force a new master password** (§4.1). Emergency Kit is re-generatable from Settings.
- **Acceptance:** wrong password/code reveals nothing; recovery flow works end-to-end; regenerating the kit re-wraps the recovery key.

#### No database, single file + backup/restore (F8) — see §11.

#### Configurable global hotkey (F9)
- User-configurable system-wide hotkey toggles the search window (default `Cmd+Shift+Space` — avoids Spotlight `Cmd+Space` and Raycast).
- Needs macOS Accessibility permission (prompted on first use). **Design so the app still works if the permission is denied** (open from the tray) — research flags MDM-locked machines can't grant it.
- **Acceptance:** hotkey summons from any app; rebinding takes effect immediately; tray fallback works without the permission.

---

### OPTIONAL MODULES — spec'd now, built after the MVP line

#### M1 — Todos (module `todos`) — *new in v2*
- Simple checklist: **title**, optional notes, **done** flag, optional **due date/time**, **priority** (low/normal/high), tags, and a per-item **reminder lead** (minutes before due).
- Optional lightweight **recurrence** (`none` | `daily` | `weekly`) — keep minimal; no full RRULE.
- **Notifications** fire at `dueAt − notifyLeadMinutes` via the shared scheduler (§8). Completing or snoozing a todo from the notification is a nice-to-have.
- Searchable/toggle-done from the command bar (scope `t `).
- **Acceptance:** add/complete/delete; due todos notify once per window; recurring todos roll forward on completion.

#### M2 — Subscriptions tracker (module `subscriptions`)
- Track: **service, URL, amount + currency, cycle (weekly/monthly/yearly/custom), next due date, auto-renew, per-item notify-lead-days, notes.** Info-only (no payment integration).
- **Notifications** when within the lead window; lead configurable globally + per item.
- **Acceptance:** editing due date/cycle reschedules; a monthly total + annualized summary is shown across all subscriptions (converted to `finance.baseCurrency` if Finance is enabled, else raw).

#### M3 — Finance snapshots (module `finance`)
- **Monthly-ish snapshots**, each a set of `{place, category, amount, currency}` across bank/WeChat/Alipay/stocks/lent/crypto/etc.
- Per snapshot: **auto stats** (total in base currency, breakdown by category) + a **free-text note**.
- A **net-worth trend line** across snapshots (uPlot).
- **FX (offline):** a small editable manual rate table (`settings.modules.finance.fxRates`); multi-currency totals convert to `baseCurrency`.
- **Acceptance:** add snapshot → total + by-category recompute; the curve updates; notes persist; editing a rate re-totals all snapshots.

#### Future candidates (architecture ready, not spec'd here)
- **Calendar** (RRULE subset, DST/timezone care) — reuses the scheduler.
- **Notes** (markdown, CodeMirror editor + sanitized react-markdown viewer) — re-adds the dropped deps.

---

### F11 — Simple, elegant, fast, customizable
- Cold start to search box **< 300 ms** after unlock; keystroke-to-results **< 30 ms** (in-memory).
- Two focused surfaces (command bar + Dashboard); calm minimal design; light/dark + accent.
- Hotkeys, lead times, result count, scope prefixes, copy behavior, **and which modules are enabled** — all configurable (§9).

---

## 7. Interaction Surfaces — Command Bar & Dashboard

keystash has **two surfaces** over the same in-memory model: the **command bar** (§7.1–7.4) for
quick keyboard-first access, and the **Dashboard** (§7.5) for browsing and managing all content.

### 7.1 Command bar — default surface
On activation the window is **just a search input** (plus a thin results list once you type). No
chrome, no sidebar. Escape or blur hides it.

### 7.2 Searching & ranking
- As you type, **fuzzy-match across all enabled modules** using the unified index (each entry exposes `searchString`, `displayLine`, `type`, `actions`).
- **Ranking = Fuse.js fuzzy score × frecency boost.** Frecency (frequency + recency of past copies/opens) is tracked per item in `frecency` and nudges your habitual items up — this is how Raycast/Alfred actually feel smart. Cheap to implement.
- **Implementation:** the bar is shadcn's **`command`** component (built on `cmdk`) as the palette shell + keyboard nav, with its built-in filter disabled (`shouldFilter={false}`) so **Fuse.js + frecency drive ranking** over the unified index; row icons via Lucide.
- Results are **one line each**, ranked, capped at `resultLimit` (default 9), numbered `1..9`.
- **Optional scope prefixes** (Alfred/Raycast-style, per-module configurable): `p ` passwords, `c ` commands, `t ` todos, `s ` subscriptions, `f ` finance. Typing `c branch` searches only commands.
- **Enter** opens the **Dashboard** focused on that item's module with the item selected (§7.5); the **numbered copy hotkey** performs the item's primary action without opening.

### 7.3 Numbered copy + interactive fill-in
- The configurable copy hotkey (default `Cmd+<n>`) triggers result *n*'s **primary action**:
  - **Password** → copy the secret to the concealed pasteboard (from Rust), then hide.
  - **Command with no placeholders** → copy immediately.
  - **Command with placeholders** → open the inline **fill-in form** (§6/F2). `Opt+Cmd+<n>` copies the raw template instead.
  - **Todo** → toggle done (or copy title); **Subscription** → copy URL; **Finance** → open snapshot.
- **Placeholder convention:** `{{name}}` marks a fill-in slot; typed `arguments` may constrain it (enum → dropdown). This replaces v1's `[ ]` strip-from-first rule (which broke on non-trailing placeholders).

### 7.4 What each result type does
| Type | `displayLine` | Primary action (`Cmd+n`) |
|---|---|---|
| Password | `GitHub — shao` | copy password (Rust → concealed clipboard) |
| Command | `Git command to delete a remote branch: git push origin --delete {{branch}}` | fill-in placeholders → copy completed (Opt+Cmd+n = raw) |
| Todo | `☐ Renew passport — due Fri` | toggle done |
| Subscription | `Linode — $20/mo — due Jul 20 — auto-renew` | copy the billing URL |
| Finance | `Snapshot Jul 2026 — $17,540` | open snapshot detail |

### 7.5 The Dashboard (browse & manage) — the second surface
A persistent window for seeing and managing **all** content — not just quick-copy. Opened via
`Cmd+Shift+D` (configurable), the tray menu, or by pressing **Enter** on a command-bar result.
Layout: **left sidebar + right content pane.**

- **Left sidebar (modules):** one row per *enabled* module — icon + title + item count — rendered straight from the registry, plus pinned **Settings** and **Lock** rows. The bottom footer shows the current app version (`keystash v0.1`) so the user can confirm which build is running after a manual upgrade. Navigate with `↑/↓` or `Cmd+1..9`; the selection persists across opens.
- **Right pane (all content):** renders the selected module's **`ListView`** — the full list/table of its items (all passwords; all commands grouped by category; the todo list; all subscriptions; the finance snapshot table + trend chart). Includes a per-module filter box, sort, and **New / Edit / Delete**. Selecting a row opens that module's `DetailView` / `EditView` inline (slide-over or split).
- **Secrets stay protected:** the passwords `ListView` shows metadata only (name, username, tags) with masked passwords; reveal/copy still route through the Rust `copy_secret` path (§4.5) — the Dashboard never holds plaintext either.
- **Registry-driven, so it scales:** a newly added module appears in the sidebar automatically via its `ListView`; a disabled module disappears but keeps its data (§3.4). No dashboard code changes per feature.
- **Empty states:** every module ships a `ListView`; an empty module shows a friendly empty state + **New**.

### 7.6 How the two surfaces relate
- **Command bar** — fast, ephemeral, keyboard-first: find → act (copy / fill / toggle) → hide.
- **Dashboard** — persistent: browse, bulk-edit, and review (finance trend, all subscriptions, the full todo list).
- **Bridge:** **Enter** on a bar result opens the Dashboard with that item's module selected and the item focused. Both surfaces read the same in-memory model, so an edit in one is instantly reflected in the other.

---

## 8. Notifications & Scheduler

- A **background task in the Rust core** (kept alive by the tray agent) runs on an interval (every few minutes) and on wake-from-sleep.
- It gathers reminders by calling every enabled module's `collectReminders(items, now, settings)` hook, so **new modules get notifications for free** — no scheduler changes.
- Currently: **todos** (due − lead), **subscriptions** (due − lead-days). Fires native notifications; **de-dupes** so each item notifies once per window (track "last notified" per item).
- All lead times configurable globally (`settings`) and per item.
- **Permissions:** macOS notification permission; the app keeps running in the background (tray/menu-bar; optionally accessory/no-Dock).

---

## 9. Settings / Configuration

All user-editable, stored inside the encrypted vault:
global hotkey; dashboard hotkey; numbered-copy hotkey; auto-lock timeout (preset minutes/hours or
never) + lock-on-blur; clipboard auto-clear
seconds; theme + accent; result limit; **per-module enable toggles + scope prefixes + module
settings** (command placeholder/copy mode; todo default lead; subscription default lead days;
finance base currency + FX table); Emergency Kit regeneration.

Settings is itself rendered from the registry: a **Modules** tab lists every module with an
enable toggle, and each enabled module contributes its own `SettingsPanel`.

---

## 10. UX / Visual Design

- **Two surfaces:** the **command bar** is the quick launcher (Escape/blur hides it); the **Dashboard** (sidebar + content pane) is the persistent browse/manage window. Both read the same live model.
- **Command-bar keys:** `↑/↓` navigate, `Enter` open in Dashboard, `Cmd+<n>` primary action, `Opt+Cmd+<n>` raw copy (commands), `Cmd+,` settings, `Cmd+L` lock, `Cmd+N` new item (context-aware), `Cmd+F` focus search.
- **Dashboard keys:** `Cmd+Shift+D` toggle Dashboard, `↑/↓` or `Cmd+1..9` switch modules in the sidebar, `Cmd+F` filter within a module, `Cmd+N` new item, `Enter` edit selected, `Esc` back.
- **Aesthetic:** minimal, high-contrast, generous spacing, one accent color, system light/dark.
- **Component system:** UI built from **shadcn/ui** primitives (Radix + Tailwind, copied into `components/ui/`, à la carte) with **Lucide** icons. Light/dark + accent map to shadcn's CSS-variable tokens, so theming is one token swap (§2.1).
- **Version visibility:** the Dashboard left-sidebar footer shows the current app version from `APP_VERSION`, which is injected from `package.json.version`, for quick upgrade/debug confirmation.
- **Onboarding (first run):** create master password → **show Emergency Kit (recovery code)** → set global hotkey → done. No security questions.

---

## 11. Backup, Restore & Upgrades

- **Backup** (`Cmd+B` / menu): choose a destination via file dialog; write a copy of the encrypted container. Already AEAD-encrypted → safe anywhere. Suggested name: `keystash-v<appVersion>-<YYYY-MM-DD-HHmm>.dat` (example: `keystash-v0.1-2026-07-07-1530.dat`).
- **Restore** (menu): choose a backup → enter master password (or recovery code) → the app **attempts full decryption**; only on success does it proceed. Prominent warning: _"Restoring will permanently erase all current data. This cannot be undone."_ Optionally auto-create a `pre-restore-<timestamp>.dat` of the current vault first, then atomically replace the live file and reload.
- **Atomicity:** write to a temp file, `fsync`, then rename over the live vault so a crash mid-write can't corrupt data.
- **Version in backups:** backups are normal vault containers. The clear container header stores `container.version`; the encrypted vault body stores `meta.appVersion` and `meta.schemaVersion`, so the backup itself knows which app/data format wrote it once unlocked.

### 11.1 Manual app upgrades
keystash upgrades by **manual replacement**: download a new `.dmg`, drag the new app into
Applications, and replace the old app. This never touches your data: the production vault lives at
`~/Library/Application Support/com.shaojiang.keystash/vault.dat`, **outside** the `.app` bundle. Opening the new
app reuses the old vault by design.

Auto-update (Tauri updater) stays off by default because it needs network (§12). The only upgrade
risk is the app code expecting a newer data shape than the existing vault has, handled by §11.2.

### 11.2 Data-format migrations (versioned, user-aware)

**Version signals**
- `package.json.version` — the single source of truth for the **current version under development**. It uses keystash's product format exactly: `main.minor` (for example `0.1`, `1.2`). The frontend build injects this as `APP_VERSION`; vault metadata, Dashboard display, backup filenames, migration comparisons, and release tags all use that value.
- `container.version` (unencrypted header, §4.2) — the crypto envelope format; bumped rarely.
- `meta.appVersion` (encrypted model, §5) — the app release that last wrote the vault.
- `meta.schemaVersion` (encrypted model, §5) — the data-model shape; bumped whenever keys, values, or module slices need a migration.
- The app binary carries the current `APP_VERSION`, `APP_SCHEMA_VERSION`, and an ordered **migration registry**. A newer build only ever rises through migrations; it never repurposes an existing key in place.
- Packaging manifests that require SemVer (for example Cargo/Tauri bundle metadata) are derived from `package.json.version` by `scripts/sync-version.mjs` as `main.minor.0`. Dev/build hooks run it directly with Node; `pnpm version:sync` exposes the same script when pnpm's policy gate allows commands to run. These fields are build/package metadata only, not app-version authorities for vaults or migrations.

**Version comparison**
- App versions are exactly `main.minor` for product logic and Git tags (`v0.1`, `v1.2`).
- Compare them by splitting into two integers: `1.10` is newer than `1.2`; `2.0` is newer than `1.99`.
- Do not derive migration behavior from package-tool SemVer fields. The app-version value to compare is always `package.json.version` / `APP_VERSION`; `main.minor.0` fields exist only so SemVer-strict tooling can build.

**The migration guide — one source of truth, maintained during development.**
Every schema bump ships **in the same release** as one migration step `vN → v(N+1)` that co-locates the transform with a human-readable **change list**. The migration guide is generated from those change lists and shipped inside the `.dmg` with the app code. Each change is typed and rendered accordingly:

| Change | User sees | Applied |
|---|---|---|
| **Added** key/value | Summarized ("N new fields"), no action needed | **Silently** (defaults fill in) |
| **Renamed** key | The **old → new path** | Value moved, no loss |
| **Transformed** value | A plain-language note | Value reshaped |
| **Removed** key | **Red — "data will be lost"**, itemized | Dropped from the live vault |

The guide shown at upgrade time is the union of the change lists from the vault's
`meta.schemaVersion` up to `APP_SCHEMA_VERSION`, grouped by type (removals highlighted in red).

**Upgrade flow — opening a newer app on an older vault**
1. **Launch → pre-unlock check** of `container.version`: if it's **newer** than this build knows, refuse ("This vault was written by a newer keystash. Please upgrade keystash.") with no writes; otherwise continue (older container formats keep working because the build retains their readers).
2. **Unlock** (master password or recovery code) → decryption yields the plaintext model.
3. **Compare app releases:** if `meta.appVersion` is **newer** than `APP_VERSION`, stop the user from using this old build: _"You are using an older version of keystash. Please upgrade keystash to open this vault."_ No projection is sent to the WebView.
4. **Compare data schema** (`meta.schemaVersion` vs `APP_SCHEMA_VERSION`):
   - **equal** → open normally; if only `meta.appVersion` is older, stamp the new app version on the next save;
   - **vault newer** → refuse with the old-app warning above;
   - **vault older** → migration needed → show the **Migration guide** (step 5).
5. **Migration guide screen** — shows exactly what will change (silent additions summarized, renames as old → new, **removals in red as data loss**) and states that a **pre-migration backup is made automatically**. The user chooses:
   - **Accept & upgrade** → auto-write a pre-migration backup named `keystash-pre-migration-v<oldAppVersion>-to-v<APP_VERSION>-<ts>.dat`, apply the ordered migrations after decrypt, re-seal + atomically write, stamp `APP_VERSION` and `APP_SCHEMA_VERSION`, then continue. Removed data is gone from the live vault but preserved in that backup.
   - **Reject** → nothing has been written yet; offer three safe choices:
     1. **Back up & quit** — copy the current (un-migrated) vault to a chosen location, then quit.
     2. **Erase & start fresh** — ⚠️ **red danger confirm** — wipe the vault and use the new build with an empty vault (offer to back up first; irreversible).
     3. **Quit** — exit without touching the vault (e.g. to reinstall the previous app version and keep using it).
6. **Reversibility** — migrations are **forward-only**; an older app refuses a migrated vault. To go back, restore the **pre-migration backup** with that older build.

**Developer contract (maintained as the format evolves)**
- Release tags are `v<main>.<minor>` (for example `v0.1`, `v1.2`). After shipping and tagging a release, immediately bump the working app version in `package.json` to the next release (for example `v1.0` shipped → working version `1.1`).
- The latest `v*` tag is the last shipped release baseline. All vault-format-affecting changes after that tag are part of the current `package.json.version` release and must either add/update a migration guide entry or explicitly state why no migration is needed.
- Never repurpose an existing key in place. To change shape, add a migration step (added / renamed / removed / transformed) and bump `APP_SCHEMA_VERSION` **in the same release**.
- Each step owns **both** its transform *and* its change list — the guide is generated from these, so the docs and the behavior can't drift.
- Migrations are pure, ordered, forward-only, and unit-tested against old-schema fixtures; a failed step leaves the original file untouched.

**Conceptual shape**
```ts
type ChangeKind = "added" | "renamed" | "removed" | "transformed";
interface SchemaChange {
  kind: ChangeKind;
  path: string;          // e.g. "settings.accent" | "modules.passwords[].url"
  newPath?: string;      // for "renamed"
  note: string;          // plain-language, shown in the guide
  dataLoss?: boolean;    // true for "removed" → rendered red
}
interface Migration {
  from: number;          // schemaVersion N
  to: number;            //               → N+1
  summary: string;
  changes: SchemaChange[];                    // drives the guide UI
  apply: (model: VaultModel) => VaultModel;   // pure, forward-only
}
```

---

## 12. macOS Permissions & Packaging

- **Permissions:** Accessibility (global hotkey — with graceful tray fallback if denied), Notifications.
- **Activation policy:** tray/menu-bar app; optionally `Accessory` (no Dock icon) so it feels like a launcher.
- **Signing & notarization:** Developer ID sign + notarize so Gatekeeper allows it and permission prompts behave well. (Fine to defer during early dev with an ad-hoc/self-signed build; do it before "daily driver" use.)
- **Auto-update (optional):** Tauri updater plugin — but it needs network; keep it opt-in and off by default to honor offline-first.

---

## 13. Adding a Feature Later (developer guide)

This is the payoff of the module registry — the flexibility you asked for:

1. Create `modules/<feature>/` with an object implementing `FeatureModule` (§3.4): `id`, `buildIndex`, `ListView` (dashboard content), `DetailView`, `EditView`, optional `SettingsPanel`, optional `collectReminders`, and `secretFields` if it holds secrets.
2. Add its initial slice via `createEmpty()`; the model gains `modules.<id>` with **no migration to other slices**.
3. Register it in `modules/index.ts`.
4. It automatically appears in: the unified search index, the **Dashboard sidebar** (its `ListView` in the right pane), the Modules settings tab (with enable toggle + its panel), the scheduler (if it has reminders), and scope-prefix routing.

**UI & tests:** build the module's `ListView` / `DetailView` / `EditView` from the shared **shadcn/ui** primitives + **Lucide** icons so it matches the app automatically, and add a **Vitest** test file covering its pure logic (index / parse / math / reminders) — see §2.1–2.2.

**Rust side:** stays module-agnostic. It only needs each module's `secretFields` (passed down from
the registry) to redact the projection and to service `copy_secret(itemId, field)`. Non-secret
modules round-trip their data to JS freely.

---

## 14. Open Questions / Risks

- **Concealed clipboard needs native Rust** — the Tauri plugin can't set `ConcealedType`; budget a small objc2/cocoa shim. Verify it works with your clipboard-history tool of choice.
- **Clipboard capture by Handoff / third-party managers** — mitigations reduce but don't eliminate; document honestly in-app.
- **Recovery-code custody** — the code unlocks everything; the Emergency Kit must not be stored beside the vault. Consider a minimum-friction "have you saved it?" confirm at setup.
- **Argon2 params on old Intel Macs** — 256 MiB / 3 iters may make unlock sluggish; expose or auto-calibrate.
- **FX rates for net worth** — manual table (v1) vs online fetch (breaks offline). Manual for v1.
- **Single file + large data** — v1 is text-only; attachments/large finance history would bloat the single blob (revisit if needed).
- **Todo recurrence scope creep** — keep to none/daily/weekly; resist growing a calendar inside todos (that's a separate future module).
- **Migration-guide drift** — the guide is user-facing safety UI, so every data-shape change after the latest `v*` tag must update the migration registry/change list and tests; `$verify` must flag missing guide updates.
- **shadcn CLI is dev-time only** — it fetches component source once when you run `add`; nothing networked at runtime. Commit the generated `components/ui/` so builds stay fully offline.
- **E2E later, not now** — unit tests (Vitest + `cargo test`) cover the MVP; add `tauri-driver` + WebdriverIO smoke tests only if the app surface grows.

---

## 15. Appendix — Library quick-reference

- **Tauri plugins:** `global-shortcut`, `notification`, `fs`, `dialog`, `single-instance` (official, v2). Plus a small custom Rust command for concealed-clipboard writes.
- **Rust crates:** `argon2`, `chacha20poly1305`, `hkdf`, `sha2`, `getrandom`, `zeroize`, `bip39` (12-word recovery), `base64`, `serde` / `serde_json`; `objc2` (clipboard shim, Phase 3). *(`getrandom` is used directly for keys/nonces/salts instead of `rand`; auto-lock uses a std background thread, so no direct `tokio`.)*
- **Frontend:** `react`, `typescript`, `tailwindcss`, `zustand`, `fuse.js`, `shiki`, `lucide-react`, **shadcn/ui** (`cmdk`, `@radix-ui/*`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss-animate`, `sonner`); `uplot` (Finance module only).
- **Testing:** `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom` (frontend); `cargo test` + `proptest` (Rust). *(Future E2E: `tauri-driver` + `webdriverio`.)*
- **Dropped from v1 (re-add with a Notes module):** `codemirror`/`milkdown`, `react-markdown`, `remark-gfm`, `rehype-sanitize`.

---

*See [plan.md](plan.md) for the phased development schedule.*
