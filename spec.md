# OwnKeep — Product / Technical Spec

> A single-file, master-password-gated, keyboard-first macOS app that unifies your
> **passwords** and **dev command snippets** — plus optional trackers (todos,
> subscriptions, finance) — behind one Spotlight-style search bar. Fully offline.

**Name:** OwnKeep
**Website:** [ownkeep.app](https://ownkeep.app)
**Target platform:** macOS 13+ (Apple Silicon + Intel)
**Author:** Shaojiang
**Status:** Draft v2.6 (OwnKeep identity finalization + container v3)
**Last updated:** 2026-07-15

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
| **Product identity** *(v2.5)* | Pre-launch working identity | **OwnKeep** · `ownkeep.app` · bundle id `com.shaojiang.ownkeep` | Emphasizes secure, offline, user-owned, customizable storage without centering the hotkey |

Confirmed unchanged: **Tauri 2 + React + TS + Rust**; Argon2id + XChaCha20-Poly1305; one
encrypted file, no database; concealed-clipboard copy; auto-lock; native notifications.

---

## 1. Overview & Design Philosophy

OwnKeep is a personal, offline-first "second brain for dangerous-to-lose stuff." Everything
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
| UI components | **shadcn/ui** (Radix + Tailwind) | Accessible primitives **copied into your repo** (à la carte: button, input, table, dialog, sheet, select, switch, tabs, badge, dropdown-menu, tooltip, sonner, calendar, popover). You own + can audit the source — ideal for a secrets app. |
| Command palette | shadcn **`command`** (`cmdk`) | Powers the command-bar shell + keyboard nav (§7.2); Fuse.js + frecency still rank (its built-in filter is disabled). |
| Testing (frontend) | **Vitest** + **React Testing Library** + `jsdom` | Vite-native, fast, Jest-compatible; tests pure module logic + critical components (§2.2). |
| Testing (Rust) | **`cargo test`** + **`proptest`** | Built-in unit tests + property tests for the crypto invariants (§2.2). |
| State | **Zustand** | Minimal, no boilerplate; good fit for the module registry. |
| Fuzzy search | **Fuse.js** | Client-side ranking over the in-memory index; combined with a frecency booster (§7.2). |
| Dates | **dayjs** | Lightweight calendar-day helpers (todo due-status badges). |
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
- **Theming ties into settings:** shadcn tokens are CSS variables (HSL) in `src/styles.css`. `settings.theme` (system/light/dark) toggles the `.dark` class; `settings.accent` maps to the `--primary` token — so "theme + accent" (§9) is a token swap, no component edits. Defaults: light = Color Hunt periwinkle mist page (`#EEF2FF` family) with **white** cards/popovers/form controls/list rows, dark = Color Hunt midnight navy (`#1A1A2E` family) with elevated card-colored list rows, accent = `#5B6CFF`.
- **Where each is used:** `command` → the command bar (§7.2); `table` → dashboard `ListView`s (passwords, subscriptions, finance); `dialog` / modal chrome → detail view, create/edit `ItemFormShell`, restore warning, keyboard help; `select` / `switch` / `tabs` → settings + enum command arguments; `sonner` → "copied" / "clipboard cleared" / error toasts; `badge` → tags / priority / auto-renew; `calendar` + `popover` → shared DatePicker / DateTimePicker (todos due = date+time; subscriptions / finance = date-only).

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
- A single production file: `~/Library/Application Support/com.shaojiang.ownkeep/vault.dat`.
- Development builds (`tauri dev` / debug builds) use
  `~/Library/Application Support/com.shaojiang.ownkeep/vault-dev.dat` and the Keychain service
  `com.shaojiang.ownkeep.biometric.dev`, so local development cannot read, replace, or delete the
  production vault or Touch ID key. Rust unit-test binaries use a third service,
  `com.shaojiang.ownkeep.biometric.test`; release builds alone use
  `com.shaojiang.ownkeep.biometric`.
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

Recovery unlock (path B, §4.1) and — when enrolled — **Touch ID unlock (path C, §4.7)** reach the
same DEK by a different unwrap; every step from *decrypt the vault body* onward is identical.

### 3.4 Feature-module registry (the backbone) — **new in v2**

The whole app is a **thin core + a set of modules**. The core knows nothing about "passwords" or
"todos" specifically; it iterates a registry. Adding a feature = writing one module and registering
it. Disabling a feature = flipping `enabled: false` (data is preserved, just hidden from the index,
nav, and scheduler). Excluding a feature from the command bar = flipping `searchable: false`
(Dashboard still shows it when enabled).

**Core responsibilities (module-agnostic):** unlock/lock, the command bar + unified index,
settings shell, backup/restore, the notification scheduler loop, global hotkey, theming.

**A module is a self-contained unit that declares:**

```ts
interface FeatureModule<T = unknown> {
  id: string;                      // "passwords" | "commands" | "todos" | ...
  title: string;                   // display name in settings/nav
  icon?: ReactNode;
  enabledByDefault: boolean;
  searchableByDefault: boolean;   // command-bar index; true only for passwords + commands by default
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
- **Unified index** = `flatMap(enabledAndSearchableModules, m => m.buildIndex(slice[m.id]))` → fed to Fuse.js + frecency.
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

OwnKeep protects passwords and financial data, so crypto is a first-class concern.

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

**Unlock path C (Touch ID — optional, §4.7):** when biometrics are enrolled, the DEK is *also*
wrapped a third time under a random `KEK_biometric` kept in the macOS Keychain behind a
biometric-gated access control. Touch ID releases `KEK_biometric` → unwrap `wrapped_biometric` →
decrypt vault. This **never replaces** the master password (still required to enroll, and always
usable); it is opt-in and device-local.

**Wrong password/code** → wrong key → AEAD unwrap fails authentication → reject. No separate
password hash to store or leak; the AEAD tag *is* the verification.

### 4.2 On-disk container format (conceptual)
```jsonc
{
  "magic": "OWNK",
  "version": 3,
  "kdf":          { "alg": "argon2id", "mem_kib": 262144, "iterations": 3, "parallelism": 4 },
  "recovery_kdf": { "alg": "hkdf-sha256" },
  "salt_master":   "<base64>",
  "salt_recovery": "<base64>",
  "wrapped_master":   { "nonce": "<b64>", "ct": "<b64>" },   // encrypts the 32-byte DEK
  "wrapped_recovery": { "nonce": "<b64>", "ct": "<b64>" },   // encrypts the same DEK
  "wrapped_biometric":{ "nonce": "<b64>", "ct": "<b64>" },   // OPTIONAL (§4.7): same DEK under a Keychain-held Touch ID key; absent unless enrolled
  "vault":            { "nonce": "<b64>", "ct": "<b64>" }    // XChaCha20-Poly1305 over the model
}
```
> Container v3 writes the OwnKeep-native `OWNK` marker. The reader also accepts the v1.1 marker by
> its byte signature and stamps v3 on the next accepted mutation, so existing vaults and backups
> remain readable without retaining the retired identity in source text. New and regenerated
> Emergency Kits use the OwnKeep HKDF context; recovery unlock falls back to the v0 context bytes so
> an existing code remains authoritative until the user regenerates it.
>
> Argon2 params (256 MiB / 3 / 4) are generous for a desktop; tune down for older Intel Macs if
> unlock feels slow. No security-questions array — the recovery path stores nothing but a salt.
>
> `wrapped_biometric` is **optional and additive** (§4.7): present only when Touch ID is enrolled,
> and its v1.1 introduction did **not** require a `container.version` bump: v2 readers could ignore
> the field and still unlock via password or recovery. Independently, any v1.2 mutation (including
> biometric enable/disable) stamps container v3 for the new OwnKeep marker, so v1.1 builds then
> refuse that file. It holds another wrap of the *same* DEK — never the DEK itself — so the Keychain
> item is useless without this vault file.

### 4.3 Runtime protections
- **Auto-lock:** wipe keys + in-memory plaintext after N minutes idle (default 1 hour; configurable in Settings — 5 / 15 / 30 minutes, 1 / 3 hours, or **never**) and optionally on window blur. Re-entry requires the master password (or Touch ID, if enrolled — §4.7). "Never" (`autoLockMinutes: 0`) keeps the vault unlocked until the user locks it manually or quits — a deliberate convenience/security trade-off surfaced in the UI.
- **Zeroize:** all key material and decrypted secrets zeroized (`zeroize`) on lock/quit.
- **Clipboard hygiene:** on copy of a secret, (a) auto-clear the pasteboard after N seconds (default 30), and (b) mark it **concealed/transient** (`org.nspasteboard.ConcealedType` + `TransientType`) so clipboard-history tools ignore it. *Requires ~20 lines of custom Rust (objc2/cocoa) — the Tauri clipboard plugin does not set these types.* *Caveat:* macOS Universal Clipboard/Handoff and some third-party managers may still capture — documented honestly in-app.
- **Failed-attempt backoff:** Argon2 is already slow; add optional exponential backoff after repeated failures.
- **Recovery-code custody:** the Emergency Kit warns the code unlocks the whole vault and must be stored offline (printed / in another password manager), never beside the vault file.

### 4.4 Backup encryption
A backup **is** the encrypted container — already safe at rest. No special export crypto: a backup
is a copy of the active vault file (`vault-dev.dat` in dev, `vault.dat` in release), openable only
with the same master password (or recovery code). The one thing a backup **omits** is the optional,
device-local Touch ID wrap (`wrapped_biometric`, §4.7) — biometric enrollment never travels in a
backup and is re-enabled per device after restore. See §11.

### 4.5 Frontend exposure hardening
- **Never load secret fields into the WebView by default.** The Rust core holds the decrypted model; it serves the frontend a projection with each module's `secretFields` redacted. A secret is returned **only** on an explicit copy action — Rust writes it straight to the concealed pasteboard and discards it; the value never enters JS.
- **Sanitize any future rendered markdown** (when a Notes module lands) with `rehype-sanitize`; disable raw HTML. *(No markdown rendering in v1.)*
- **Disable WebView devtools in production**; set a strict Content-Security-Policy.

### 4.6 Emergency Kit (recovery)
Shown once at setup and re-downloadable from Settings (regenerates a fresh code + re-wraps):
- **Recovery code**: 128-bit, rendered as **12 words** (EFF/BIP39-style wordlist, easy to transcribe) — or grouped Base32 `OWNK-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX` if a non-mnemonic format is added later.
- Includes app name + creation date + instructions. **Does not include the master password.**
- Offered as a printable / saveable card (PDF or plain text via the file dialog).

### 4.7 Biometric unlock (Touch ID) — optional, device-local

An **opt-in convenience**: on a Mac with Touch ID, unlock OwnKeep with a fingerprint instead of
typing the master password. The **master password and the recovery code are the only authoritative
credentials** — they can always unlock the vault, and Touch ID is strictly a secondary shortcut
layered on top. Touch ID is an **addition to**, never a **replacement for**, them: enrolling
requires an already-unlocked vault (so the master password is proven first), and losing, disabling,
or never enabling Touch ID **never locks you out** — the password and recovery code always remain.
Off by default.

**Mechanism — a third envelope wrap (mirrors §4.1).** Enabling Touch ID (only possible while the
vault is *unlocked*, so the DEK is in hand) generates a random 256-bit `KEK_biometric`, wraps the
DEK a third time — `wrapped_biometric = AEAD_encrypt(DEK, KEK_biometric)` (stored in the container,
§4.2) — and stores **`KEK_biometric` in the macOS Keychain** behind a biometric-gated
`SecAccessControl`. We store a *wrapping key*, not the DEK, so the Keychain item alone is useless
without this vault file (defense in depth).

- **Access control:** `kSecAccessControlBiometryCurrentSet` (adding/removing a fingerprint
  invalidates the item → re-enroll with the master password) + `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
  (never leaves the device, never syncs to iCloud Keychain, only readable while the macOS session is
  unlocked).
- **Build isolation:** release, debug, and test builds use separate Keychain services
  (`com.shaojiang.ownkeep.biometric`, `.dev`, and `.test`) so development or native unit tests
  cannot overwrite/delete a production enrollment. This changes only device-local Keychain
  addressing — not the vault/container shape — and therefore requires no migration.
- **Unlock path C:** LocalAuthentication (`LAContext`, reason "Unlock OwnKeep") prompts Touch ID →
  on success the Keychain releases `KEK_biometric` → Rust unwraps `wrapped_biometric` → DEK →
  decrypt the vault. Identical to paths A/B from the DEK onward; **the wrapping key and the biometric
  prompt never enter the WebView** (§4.5 preserved).
- **Enable / disable:** enable = generate + Keychain-store `KEK_biometric`, wrap the DEK, persist
  `wrapped_biometric`. Disable = delete the Keychain item and drop `wrapped_biometric`. Toggled from
  Settings → System → Security (§9).
- **Availability & fallback:** the Touch ID button appears only when the sensor is present *and*
  enrolled; a failed/canceled prompt, a missing sensor, or an invalidated item (fingerprints
  changed) falls back to the master-password field with no data change. **Enrolled state is derived
  in Rust** (`wrapped_biometric` present ∧ Keychain key present ∧ hardware available) — it is
  **not** stored in `settings`, so there is no encrypted-model schema change and nothing to drift.
- **Auto-lock still applies:** Touch ID unlocks whenever the vault is locked (cold start or after
  auto-lock); it does not weaken the idle timeout or `zeroize`-on-lock (§4.3).
- **Backups exclude Touch ID (§11).** Enrollment is device-local, so `wrapped_biometric` is
  **stripped from every backup** (manual, pre-migration, pre-restore). A restored (or copied) vault
  therefore shows Touch ID as *not enrolled* and can be re-enabled **fresh, like new**; restoring or
  erasing the vault also clears the device-local Keychain item so no orphan key remains. The backup
  UI notifies the user of this whenever Touch ID is enrolled.
- **Manage / update from Settings → System → Security (§9):** enable, disable, or **re-enroll
  ("update")** — re-enrollment issues a fresh `KEK_biometric` and re-wrap, which is also how the user
  recovers after a fingerprint-set change invalidates the item.

**Trade-off (flagged against the "one encrypted file" rule, §1/§14).** Biometric unlock is the one
place OwnKeep keeps key material **outside** the single vault file: a device-local wrapping key in
the OS Keychain (Secure Enclave-protected). The *vault data* is still one encrypted file; this is an
**opt-in, device-local exception** that is unavoidable for biometric unlock and matches how
mainstream managers implement it. It stays **fully offline** (LocalAuthentication + Keychain are
local; no network), honoring offline-first. Users who want zero auxiliary key material simply leave
Touch ID off (the default).

---

## 5. Data Model (single JSON document, encrypted as one blob)

Shape mirrors the module registry: shared `settings` + a `modules` map. Enabling/disabling a module
never migrates another module's slice.

```jsonc
{
  "meta": { "schemaVersion": 11, "appVersion": "1.0", "createdAt": "ISO", "updatedAt": "ISO" },

  "settings": {
    "globalHotkey": "Cmd+Shift+Space",       // activate/toggle the search window
    "dashboardHotkey": "Cmd+Shift+D",        // open/toggle the dashboard window
    "copyHotkey": { "modifiers": "Opt+Shift", "keys": "1-9" },  // numbered copy
    "autoLockMinutes": 60,                    // 0 = never auto-lock
    "lockOnBlur": false,
    "clipboardClearSeconds": 30,
    "theme": "system",                        // system | light | dark
    "accent": "#5B6CFF",
    "resultLimit": 9,
    "categoryOptions": ["Work", "Personal", "Dev", "Finance", "Casual", "Misc"], // single-select labels; default Personal
    "tagOptions": ["React", "Bash", "Git", "TypeScript", "AI", "MongoDB", "PostgreSQL", "CSS", "HTML", "JavaScript", "Network", "Crypto"], // multi-select labels; default React
    "modules": {                              // per-module enable + searchable flags + settings live here
      "passwords":     { "enabled": true, "searchable": true },
      "commands":      { "enabled": true, "searchable": true, "placeholderSyntax": "{{ }}", "defaultCopyMode": "fill" },
      "todos":         { "enabled": true, "searchable": false, "scopePrefix": "t", "defaultLeadMinutes": 30 },
      "subscriptions": { "enabled": true, "searchable": false, "scopePrefix": "s", "defaultLeadDays": 3 },
      "finance":       { "enabled": true, "searchable": false, "scopePrefix": "f", "baseCurrency": "CNY", "fxRates": { "USD": 7.2, "SGD": 5.3 }, "holderOptions": ["Me", "Wife", "Child", "Parent"], "categoryOptions": ["Bank", "Crypto", "Real estate", "Stock", "Gold", "Lent", "E-wallet"] }
    }
  },

  "frecency": { /* itemId → { count, lastUsedAt } */ },   // command-bar ranking; non-secret

  "modules": {
    "passwords": [
      { "id": "uuid", "name": "GitHub", "username": "shao", "password": "secret",   // secretFields: ["password"]
        "loginUrl": "https://github.com/login", "recoveryUrl": "https://github.com/password_reset",
        "notes": "", "category": "Personal", "updatedAt": "ISO" }
    ],

    "commands": [
      { "id": "uuid", "category": "Dev", "title": "Delete a remote branch",
        "description": "Delete a branch on origin",
        "snippets": [ { "language": "bash", "code": "git push origin --delete {{branch}}" } ],
        "primaryCopyTemplate": "git push origin --delete {{branch}}",
        "arguments": [ { "name": "branch", "type": "text", "description": "branch name" } ],
        "tags": ["git", "branch"], "updatedAt": "ISO" }
    ],

    "todos": [
      { "id": "uuid", "title": "Renew passport", "notes": "", "done": false,
        "dueAt": "ISO|null", "notifyLeadMinutes": 30, "priority": "normal",  // low|normal|high
        "category": "Personal", "recurrence": null, "updatedAt": "ISO" }
    ],

    "subscriptions": [
      { "id": "uuid", "service": "Linode", "url": "https://cloud.linode.com/account/billing",
        "amount": 20, "currency": "CNY", "cycle": "monthly",   // weekly|monthly|yearly|custom; form default CNY
        "customIntervalDays": null, "nextDueDate": "ISO", "autoRenew": true,
        "notifyLeadDays": 3, "notes": "", "category": "Personal", "tags": ["React"], "updatedAt": "ISO" }
    ],

    "finance": [
      { "id": "uuid", "date": "ISO",  // date-only UI; stored as local 23:59:59
        "entries": [
          { "place": "DBS",     "holder": "Me",    "category": "Bank",   "amount": 12000, "currency": "SGD" },
          { "place": "WeChat",  "holder": "Wife",  "category": "E-wallet", "amount": 800, "currency": "CNY" },
          { "place": "Binance", "holder": "Me",    "category": "Crypto", "amount": 5000,  "currency": "USD", "dueDate": "ISO" }
        ],
        "note": "Free text, e.g. paid annual insurance premium this month.",
        "updatedAt": "ISO" }
    ]
  }
}
```

*(The finance slice is a bare `Snapshot[]`, like every other module. FX rates, baseCurrency, holderOptions, and finance categoryOptions live under `settings.modules.finance`; totals + by-category are **derived on the fly** from the FX table,
so editing a rate re-totals every snapshot. Future calendar/notes modules add their own slice under
`modules` with no impact on the above.)*

---

## 6. Feature Specifications

### CORE — ships in the first runnable version

#### F1 — Password vault (module `passwords`)
- Fields: **name** (memorable label), **username**, **password**, **login URL**, **recovery URL**, optional notes + **category**.
- **Create form:** a **Generate** button beside the password field fills a cryptographically random 16-character password from digits, lower/upper letters, and `!@#$%^&*()_+-=~[];',.?|{}:"<>/` (via `crypto.getRandomValues`). Each generated password includes **≥1 digit, ≥1 lowercase, ≥1 uppercase, and ≥2 specials**, with character classes **interleaved** (adjacent characters use different classes). It copies the value to the clipboard and toasts **Password generated and copied** (or a clipboard error). The value is still only in the create form until Save (not yet a vault secret served via `copy_secret`).
- `secretFields: ["password"]` — the password is never sent to the WebView; it renders masked `••••••`.
- **Copy** pulls the value from Rust, writes it to a concealed pasteboard, schedules auto-clear. An explicit "reveal" toggle shows plaintext temporarily (fetched on demand, not held).
- Login/recovery URLs are click-to-open in the **system browser** via Tauri's opener plugin (WebView `window.open` is blocked).
- **Benchmark:** matches KeePassXC's single-file model; XChaCha20-Poly1305 + Argon2id ≈ KeePassXC's ChaCha20 + Argon2id + Encrypt-then-MAC (AEAD gives us the MAC for free).
- **Acceptance:** create/edit/delete; create-form Generate fills a 16-char password meeting the class/interleave rules, copies it, and toasts success; copy password without it ever appearing in the DOM; masked by default; URLs open in the system browser.

#### F2 — Command library (module `commands`)
- Dashboard `ListView` groups cards **by tag** (a command with multiple tags appears under each; no tags → Untagged). Category remains a field and filter.
- Each command: a **title** ("Delete a remote branch"), a **category** (git/docker/mongo/…), optional description, and **one or more syntax-highlighted snippets** (Shiki). Snippet language is chosen from a fixed select: TypeScript (default), Bash, SQL, Python, Ruby, CSS, HTML, JavaScript.
- One-line searchable form: `"<category> command to <title>: <primaryCopyTemplate>"`, e.g. `"Git command to delete a remote branch: git push origin --delete {{branch}}"`.
- **Placeholders** use `{{name}}` (Warp-aligned). Names: `A-Za-z0-9_-`, not starting with a digit. Same name = same value (reused). Optional typed `arguments` (`text` | `enum` with `values`) enable dropdowns and validation (Warp-style).
- **Copy behavior (interactive fill-in — the confirmed default):**
  - No placeholders → copy immediately.
  - Has placeholders → open an inline mini-form (one field per unique placeholder; enum → dropdown), Tab/Shift-Tab to move, Enter copies the **completed** command. Handles placeholders anywhere in the string.
  - Secondary action **"copy raw"** (Opt+Enter, or Opt+Cmd+number in the bar) copies the template verbatim, placeholders intact, for quick terminal typing.
- **Benchmark:** Warp Workflows `{{arg}}` + Raycast snippet placeholders + navi/pet interactive fill.
- **Acceptance:** multi-line snippets highlight; hovering a snippet line shows a copy affordance and clicking the line copies that line only (lines with `{{ }}` open the same interactive fill-in as full-command copy); a mid-string placeholder fills correctly; raw copy preserves `{{ }}`.

#### Command bar + numbered copy (F10) — see §7 (the heart of the app).

#### Master-password gate + recovery (F7)
- Every launch requires the **master password** before any decryption.
- If forgotten, enter the **recovery code** → recovery-path unlock → **force a new master password** (§4.1). Emergency Kit is re-generatable from Settings.
- If **both** the master password and recovery code are lost: from the lock screen, **save a copy** of the encrypted vault file to a chosen location, then **erase the local vault** and return to onboarding to create a new empty vault. The saved copy stays encrypted and is unreadable without credentials.
- **Acceptance:** wrong password/code reveals nothing; recovery flow works end-to-end; regenerating the kit re-wraps the recovery key; lost-credentials path requires an explicit backup before erase.

#### Biometric unlock — Touch ID (F12) — *optional, macOS-only, off by default*
- **Master password + recovery code are the ultimate, authoritative credentials — they always unlock.** On a Touch ID Mac, Touch ID adds a fingerprint shortcut via **unlock path C** (§4.7): a third DEK wrap under a Keychain-held, biometric-gated key. It **never replaces** the password/recovery, enrolling requires an already-unlocked vault, and losing or disabling Touch ID never locks the user out.
- **Managed from Settings → System → Security (§9):** enable, disable, or **re-enroll ("update")**; disabling removes the Keychain item + the `wrapped_biometric` container field. No encrypted-model schema change (enrolled state is derived in Rust).
- **Excluded from backups (§11):** `wrapped_biometric` is stripped from every backup, so a restored vault has Touch ID off and can be re-enabled **fresh, like new**; the backup UI notifies the user when Touch ID is enrolled. Restore/erase also clear the device-local Keychain item.
- Fully offline (LocalAuthentication + Keychain, no network); the biometric wrapping key never enters the WebView (§4.5). Graceful fallback to the password when the sensor is absent, the prompt is denied, or the item was invalidated by a fingerprint-set change.
- **Acceptance:** enroll while unlocked; Touch ID unlocks the vault; disable/re-enroll from Settings works; master password + recovery always unlock (Touch ID loss never locks out); a backup omits the biometric wrap and shows the notice; after restore Touch ID is off and can be re-enabled; a canceled/failed prompt falls back to the password with no data loss.

#### No database, single file + backup/restore (F8) — see §11.

#### Configurable global hotkey (F9)
- User-configurable system-wide hotkey toggles the search window (default `Cmd+Shift+Space` — avoids Spotlight `Cmd+Space` and Raycast).
- Needs macOS Accessibility permission (prompted on first use). **Design so the app still works if the permission is denied** (open from the tray) — research flags MDM-locked machines can't grant it.
- **Acceptance:** hotkey summons from any app; rebinding takes effect immediately; tray fallback works without the permission.

---

### OPTIONAL MODULES — spec'd now, built after the MVP line

#### M1 — Todos (module `todos`) — *new in v2*
- Simple checklist: **title**, optional notes, **done** flag, optional **due date/time** (DateTimePicker; new picks default to local `23:59:59`, time is editable), **priority** (low/normal/high), **category**, and a per-item **reminder lead** (minutes before due).
- Optional lightweight **recurrence** (`none` | `daily` | `weekly`) — keep minimal; no full RRULE. Checking Done always marks the item done (moves it to the Done tab); recurrence is metadata for the task, not an auto-postpone on complete.
- **Due status badges** (open todos with a due date): the list Due column shows only the colorful chip (**Overdue** / **Due today** / **Due in N days**, calendar-day diff via dayjs) — not the absolute datetime. Done and undated open todos still show the formatted due text (or “No due date”). Detail/done rows show date + time.
- **Priority badges**: list and detail views show a colored chip with icon — **High** (rose), **Normal** (neutral), **Low** (sky).
- **Date fields (shared):** subscription next due and finance snapshot date use a date-only DatePicker (stored as local end-of-day). Todo due uses a DateTimePicker (date + editable time, default `23:59:59`).
- **Notifications** fire at `dueAt − notifyLeadMinutes` via the shared scheduler (§8). Completing or snoozing a todo from the notification is a nice-to-have.
- Optional command-bar search when `searchable` is on (off by default; scope `t `). Activating a todo hit opens the Dashboard Todos pane (no per-item focus). Dashboard is the primary surface for complete/edit.
- **Acceptance:** add/complete/delete; due todos notify once per window; checking Done marks the item done (including recurring); open dated todos show the correct due-status badge.

#### M2 — Subscriptions tracker (module `subscriptions`)
- Track: **service, URL, amount + currency, cycle (weekly/monthly/yearly/custom), next due date, auto-renew, per-item notify-lead-days, notes.** Info-only (no payment integration).
- **Due status badges** (same calendar-day chip as todos): the list Next due column shows only **Overdue** / **Due today** / **Due in N days** — not the absolute date. Detail shows the formatted date plus the chip.
- **List:** a headerless billing-URL column (left of the ⋮ menu) shows a **Link** icon when `url` is http(s); empty or non-http URLs show nothing. Click opens in the system browser (§4 / passwords login-URL pattern).
- **Notifications** when within the lead window; lead configurable globally + per item.
- **FX rates:** the same header **FX rates** control as Finance opens the shared manual rate table (`settings.modules.finance`) used for the converted summary.
- **Acceptance:** editing due date/cycle reschedules; open dated rows show the correct due-status badge; a monthly total + annualized summary is shown across all subscriptions (converted to `finance.baseCurrency` if Finance is enabled, else raw); FX rates can be edited from the Subscriptions header.

#### M3 — Finance snapshots (module `finance`)
- **Monthly-ish snapshots**, each a set of `{place, holder, category, amount, currency, dueDate?}` across bank / crypto / real estate / stock / gold / lent / e-wallet / etc.
- **Holder** and **category** are selects whose option lists live in Finance settings (`settings.modules.finance.holderOptions` defaults Me / Wife / Child / Parent; `categoryOptions` defaults Bank / Crypto / Real estate / Stock / Gold / Lent / E-wallet). Existing non-list values still appear when editing.
- Optional **due date** per holding (date-only; clearable; omitted when unset).
- **Duplicate last:** floating bottom-right action copies the newest snapshot’s holdings into a new create form with today’s date (amounts kept for manual tweak).
- Per snapshot: **auto stats** (total in base currency, breakdown by category) + a **free-text note**.
- A **net-worth trend line** across snapshots (uPlot).
- **FX (offline):** a small editable manual rate table (`settings.modules.finance.fxRates`); multi-currency totals convert to `baseCurrency`. New forms and unset base currency default to **CNY**; currency pickers offer **CNY** and **USD** (existing non-list values still display when editing).
- Header **Settings** edits holder/category option lists; **FX rates** edits the rate table.
- **Acceptance:** add snapshot → total + by-category recompute; the curve updates; notes persist; editing a rate re-totals all snapshots; holder/category options changed in Finance settings drive new holding rows; optional per-holding due dates persist.

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

OwnKeep has **two surfaces** over the same in-memory model: the **command bar** (§7.1–7.4) for
quick keyboard-first access, and the **Dashboard** (§7.5) for browsing and managing all content.

### 7.1 Command bar — default surface
On activation the window is **just a search input** (plus a thin results list once you type). No
chrome, no sidebar. Escape or blur hides it. A **Dashboard** control on the right of the search
input opens the Dashboard (§7.6).

### 7.2 Searching & ranking
- As you type, **fuzzy-match across enabled modules that are also `searchable`** using the unified index (each entry exposes `searchString`, `displayLine`, `type`, `actions`). By default only **passwords** and **commands** are searchable; todos / subscriptions / finance stay Dashboard-first (toggleable in Settings).
- **Ranking = Fuse.js fuzzy score × frecency boost.** Frecency (frequency + recency of past copies/opens) is tracked per item in `frecency` and nudges your habitual items up — this is how Raycast/Alfred actually feel smart. Cheap to implement.
- **Implementation:** the bar is shadcn's **`command`** component (built on `cmdk`) as the palette shell + keyboard nav, with its built-in filter disabled (`shouldFilter={false}`) so **Fuse.js + frecency drive ranking** over the unified index; row icons via Lucide.
- Results are **one line each**, ranked, capped at `resultLimit` (default 9), numbered `1..9`, each showing its **`⌥⇧n`** hotkey hint.
- **Optional scope prefixes** (Alfred/Raycast-style, per-module configurable): `p ` passwords, `c ` commands, `t ` todos, `s ` subscriptions, `f ` finance. Typing `c branch` searches only commands. Scope prefixes only apply to modules that are currently searchable.
- **Enter** / click / `⌥⇧<n>` all run the result's **primary action** (§7.3–7.4). For non-password / non-command hits that means opening the Dashboard on that module's pane (no per-item focus).

### 7.3 Numbered copy + interactive fill-in
- The numbered copy hotkey (default `Opt+Shift+<n>`) triggers result *n*'s **primary action**:
  - **Password** → copy the secret to the concealed pasteboard (from Rust), show the success toast, then hide after ~2s.
  - **Command with no placeholders** → copy immediately.
  - **Command with placeholders** → open the inline **fill-in form** (§6/F2). `Opt+Cmd+<n>` copies the raw template instead.
  - **Other modules** (todos, subscriptions, finance, …) → open the **Dashboard** on that module's pane and hide the launcher immediately (no per-item focus required).
- **Placeholder convention:** `{{name}}` marks a fill-in slot; typed `arguments` may constrain it (enum → dropdown). This replaces v1's `[ ]` strip-from-first rule (which broke on non-trailing placeholders).

### 7.4 What each result type does
| Type | `displayLine` | Primary action (`⌥⇧n`) |
|---|---|---|
| Password | `GitHub — shao` | copy password (Rust → concealed clipboard) |
| Command | `Git command to delete a remote branch: git push origin --delete {{branch}}` | fill-in placeholders → copy completed (⌥⌘n = raw) |
| Todo | `☐ Renew passport — due Fri` | open Dashboard → Todos |
| Subscription | `Linode — $20/mo — due Jul 20 — auto-renew` | open Dashboard → Subscriptions |
| Finance | `Snapshot Jul 2026 — $17,540` | open Dashboard → Finance |

### 7.5 The Dashboard (browse & manage) — the second surface
A persistent window for seeing and managing **all** content — not just quick-copy. Opened via
`Cmd+Shift+D` (configurable), the tray menu, the command-bar **Dashboard** button, or a
command-bar primary action on a non-password / non-command result (§7.3). Mutually exclusive with
the command bar (§7.6).
Layout: **left sidebar + right content pane.**

- **When locked:** opening the Dashboard shows the same master-password unlock form as the launcher — users can unlock in place without switching to the command bar.
- **Left sidebar (modules):** a **Search ...** row at the top jumps back to the command bar (`⌘⇧Space`); then one row per *enabled* module — icon + title + item count — rendered straight from the registry, plus pinned **Settings**, **Help** (`⌘H`), **About** (`⌘/`), and **Lock** rows. The bottom footer shows the current app version (`OwnKeep v0.1`) so the user can confirm which build is running after a manual upgrade. Navigate with `↑/↓` or `⌥⇧1..9`; the selection persists across opens.
- **Right pane (all content):** renders the selected module's **`ListView`** — the full list/table of its items (all passwords; all commands grouped by tag with title, description, and highlighted snippet per card; the todo list; all subscriptions; the finance snapshot table + trend chart). Includes a per-module filter box (with a **category** select on passwords, commands, todos, and subscriptions — All categories or one category — plus a **Clear Filters** control whenever a search query or non-default filter is active — **Escape** clears active filters even while the search box or category select is focused (open dialogs and menus still own Escape first); todos also reset the Undone/Done/All status chip to Undone), **sortable table headers** (passwords, todos, subscriptions, finance; the active sort column keeps the same accent highlight as hover), a narrow non-sortable leftmost **#** index (display-only 1-based position in the current filtered/sorted view — not stored in the vault; command cards show the same leading index), and **New / Edit / Delete**. Row actions use a compact **⋮ overflow menu** (no "Actions" header label) with View / Edit / Delete; passwords keep Copy on the username/password cells, and command cards keep a ghost **Copy** icon button left of the ⋮ menu (not in the menu). **Delete** always asks for confirmation in a shared dismissible dialog (Cancel / Esc / backdrop, or confirm Delete) before removing the item. The primary name/title (password name, command title, todo title, subscription service, finance snapshot date) is clickable and opens the same detail modal as **View**. Row **View** opens the module's `DetailView` in a dismissible two-column modal (Esc + click-away); list **category** (passwords, todos) and **priority** (todos) cells, and subscription **cycle** / **renew** cells, open a one-click **dropdown menu** to pick a new value and save immediately. **New / Edit** open the module's `EditView` in a modal-style elevated card over a dimmed pane (Creating/Editing badge, Esc + backdrop dismiss). Table columns use fixed proportional widths so headers and common values (e.g. email usernames) stay readable without manual resizing.
- **Secrets stay protected:** the passwords `ListView` shows metadata only (name, username, category) with masked passwords; clicking the mask reveals via Rust `reveal_secret` (native dialog — plaintext never enters the WebView); copy buttons in the username/password columns route through `copy_secret` / clipboard (§4.5). A headerless **login-URL** column (left of the ⋮ menu) shows an external-link icon when `loginUrl` is http(s); empty or non-http URLs show nothing.
- **Sidebar footer:** Settings, **Help** (`⌘H` opens the keyboard-shortcut sheet), **About** (`⌘/` opens product info: features, developer email, version, release date, website), and Lock sit below the module list; the floating help trigger is not shown on the Dashboard (the command bar keeps its own).
- **Registry-driven, so it scales:** a newly added module appears in the sidebar automatically via its `ListView`; a disabled module disappears but keeps its data (§3.4). No dashboard code changes per feature.
- **Empty states:** every module ships a `ListView`; an empty module shows a friendly empty state + **New**.

### 7.6 How the two surfaces relate
- **Command bar** — fast, ephemeral, keyboard-first: find → act (copy / fill / toggle) → hide.
- **Dashboard** — persistent: browse, bulk-edit, and review (finance trend, all subscriptions, the full todo list).
- **Mutually exclusive:** only one surface is visible at a time. Opening the command bar hides the Dashboard, and opening the Dashboard hides the command bar (hotkeys, tray, the command-bar **Dashboard** button, the Dashboard **Search ...** row, and the bar→Dashboard bridge all honor this).
- **Close button:** the traffic-light close control asks for confirmation, then **quits the whole app** (both surfaces + tray). Cancel leaves the window open. Esc/blur on the command bar still only hides the launcher. Tray **Exit** also exits.
- **Tray menu:** menu-bar icon opens **Search ...** (launcher / command bar, shows the global hotkey), **Dashboard** (shows the Dashboard hotkey), then **Exit**.
- **Bridge:** activating a non-password / non-command bar result opens the Dashboard with that item's module selected (module pane only — no per-item focus). Password and command hits keep their copy / fill-in primary actions. Explicit UI switches: command-bar **Dashboard** button → Dashboard; Dashboard **Search ...** → command bar. Both surfaces read the same in-memory model, so an edit in one is instantly reflected in the other.

---

## 8. Notifications & Scheduler

- A **background task in the Rust core** (kept alive by the tray agent) runs on an interval (every few minutes) and on wake-from-sleep.
- It gathers reminders by calling every enabled module's `collectReminders(items, now, settings)` hook, so **new modules get notifications for free** — no scheduler changes.
- Currently: **todos** (due − lead), **subscriptions** (due − lead-days). Fires native notifications; **de-dupes** so each item notifies once per window (track "last notified" per item).
- All lead times configurable globally (`settings`) and per item.
- **Permissions:** macOS notification permission; the app keeps running in the background (tray/menu-bar; optionally accessory/no-Dock). Delivery uses `UNUserNotificationCenter` so banners belong to **OwnKeep**; clicking a reminder opens the Dashboard to that module/item. Bare `pnpm dev` binaries (no `.app` bundle) cannot own native notifications — use a built/installed `OwnKeep.app` for click-through reminders.

---

## 9. Settings / Configuration

All user-editable, stored inside the encrypted vault:
global hotkey; dashboard hotkey; numbered-copy hotkey; auto-lock timeout (preset minutes/hours or
never) + lock-on-blur; clipboard auto-clear
seconds; theme + accent; result limit; **category/tag option lists** (editable in Settings — one
label per line; used by item edit forms); **per-module enable + searchable toggles + scope prefixes + module
settings** (command placeholder/copy mode; todo default lead; subscription default lead days;
finance base currency + FX table + holder/category option lists); Emergency Kit regeneration; **Touch ID / biometric unlock**
enable / disable / re-enroll (§4.7 — device-local; state derived in Rust, not stored in the encrypted model).

The default Settings menu stays focused on **Modules**, **Hotkeys**, **Categories**, and **Tags**.
Advanced app/runtime controls — security (Touch ID / biometric unlock UI deferred until after v1.0; Rust §4.7 remains), appearance,
**vault file path** (read-only), backup/restore, and Emergency Kit — live in a
secondary **System** menu under Settings. Settings is itself rendered from the registry: the
**Modules** section lists every module with an enable toggle and a searchable toggle (command-bar
inclusion; defaults on for passwords + commands), and each enabled module contributes its
own `SettingsPanel`.

---

## 10. UX / Visual Design

- **Two surfaces:** the **command bar** is the quick launcher (Escape/blur hides it); the **Dashboard** (sidebar + content pane) is the persistent browse/manage window. Both read the same live model.
- **Command-bar keys:** `↑/↓` navigate, `Enter`/click/`⌥⇧<n>` primary action, `⌥⌘<n>` raw copy (commands), `Cmd+,` settings, `Cmd+L` lock, `Cmd+N` new item (context-aware), `Cmd+F` focus search.
- **Dashboard keys:** `Cmd+Shift+D` toggle Dashboard, `↑/↓` or `⌥⇧1..9` switch modules in the sidebar, `Cmd+F` filter within a module, `Cmd+N` new item, `Enter` edit selected, `Esc` back / dismiss form.
- **Aesthetic:** calm dual themes (periwinkle mist light page + white surfaces / midnight navy dark) with one accent (`#5B6CFF` default), generous spacing, high-contrast text.
- **Component system:** UI built from **shadcn/ui** primitives (Radix + Tailwind, copied into `components/ui/`, à la carte) with **Lucide** icons. Light/dark + accent map to shadcn's CSS-variable tokens, so theming is one token swap (§2.1).
- **Version visibility:** the Dashboard left-sidebar footer shows the current app version from `APP_VERSION`, which is injected from `package.json.version`, for quick upgrade/debug confirmation.
- **Onboarding (first run):** cold start **shows and focuses** the main window with the master-password setup form (blur-to-hide is off until the compact command bar). Create master password → **show Emergency Kit (recovery code)** → set global hotkey → done. The form shows the vault file path (`~/Library/Application Support/com.shaojiang.ownkeep/vault.dat` in production; `vault-dev.dat` in debug). No security questions. *(Touch ID is optional and enabled later from Settings → System → Security, §4.7 — not part of first-run setup; it may be offered once after the first successful unlock.)*
- **Vault path in Settings:** Settings → System shows the vault file path as read-only text (same location as §11.1).

---

## 11. Backup, Restore & Upgrades

- **Backup** (`Cmd+B` / menu): choose a destination via file dialog; write a copy of the encrypted container. Already AEAD-encrypted → safe anywhere. Suggested name: `ownkeep-v<appVersion>-<YYYY-MM-DD-HHmm>.dat` (example: `ownkeep-v0.1-2026-07-07-1530.dat`). The copy **omits the device-local Touch ID wrap** (`wrapped_biometric`, §4.7); when Touch ID is enrolled the backup UI shows a **notice** that biometric unlock isn't included and must be re-enabled after restoring on the target Mac. Existing `.dat` backups remain valid because restore is filename-agnostic and the reader retains supported container versions.
- **Restore** (menu): choose a backup → enter master password (or recovery code) → the app **attempts full decryption**; only on success does it proceed. Prominent warning: _"Restoring will permanently erase all current data. This cannot be undone."_ Optionally auto-create a `pre-restore-<timestamp>.dat` of the current vault first, then atomically replace the live file and reload. Restore also **clears the device-local Touch ID Keychain item**; because backups carry no biometric wrap (§4.7), the restored vault has Touch ID **off** — re-enable it in Settings → System → Security.
- **Atomicity:** write to a temp file, `fsync`, then rename over the live vault so a crash mid-write can't corrupt data.
- **Version in backups:** backups are normal vault containers. The clear container header stores `container.version`; the encrypted vault body stores `meta.appVersion` and `meta.schemaVersion`, so the backup itself knows which app/data format wrote it once unlocked.

### 11.1 Manual app upgrades
OwnKeep upgrades by **manual replacement**: download a new `.dmg`, drag the new app into
Applications, and replace the old OwnKeep app. This never touches your data: the production vault lives at
`~/Library/Application Support/com.shaojiang.ownkeep/vault.dat`, **outside** the `.app` bundle. Opening the new
app reuses the old vault by design.

Auto-update (Tauri updater) stays off by default because it needs network (§12). The only upgrade
risk is the app code expecting a newer data shape than the existing vault has, handled by §11.2.

### 11.2 Data-format migrations (versioned, user-aware)

**Version signals**
- `package.json.version` — the single source of truth for the **current version under development**. It uses OwnKeep's product format exactly: `main.minor` (for example `0.1`, `1.2`). The frontend build injects this as `APP_VERSION`; vault metadata, Dashboard display, backup filenames, migration comparisons, and release tags all use that value.
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
1. **Launch → pre-unlock check** of `container.version`: if it's **newer** than this build knows, refuse ("This vault was written by a newer OwnKeep. Please upgrade OwnKeep.") with no writes; otherwise continue (older container formats keep working because the build retains their readers).
2. **Unlock** (master password or recovery code) → decryption yields the plaintext model.
3. **Compare app releases:** if `meta.appVersion` is **newer** than `APP_VERSION`, stop the user from using this old build: _"You are using an older version of OwnKeep. Please upgrade OwnKeep to open this vault."_ No projection is sent to the WebView.
4. **Compare data schema** (`meta.schemaVersion` vs `APP_SCHEMA_VERSION`):
   - **equal** → open normally; if only `meta.appVersion` is older, stamp the new app version on the next save;
   - **vault newer** → refuse with the old-app warning above;
   - **vault older** → migration needed → show the **Migration guide** (step 5).
5. **Migration guide screen** — shows exactly what will change (silent additions summarized, renames as old → new, **removals in red as data loss**) and states that a **pre-migration backup is made automatically**. The user chooses:
   - **Accept & upgrade** → auto-write a pre-migration backup named `ownkeep-pre-migration-v<oldAppVersion>-to-v<APP_VERSION>-<ts>.dat`, apply the ordered migrations after decrypt, re-seal + atomically write, stamp `APP_VERSION` and `APP_SCHEMA_VERSION`, then continue. Removed data is gone from the live vault but preserved in that backup.
   - **Reject** → nothing has been written yet; offer three safe choices:
     1. **Back up & quit** — copy the current (un-migrated) vault to a chosen location, then quit.
     2. **Erase & start fresh** — ⚠️ **red danger confirm** — wipe the vault and use the new build with an empty vault (offer to back up first; irreversible).
     3. **Quit** — exit without touching the vault (e.g. to reinstall the previous app version and keep using it).
6. **Reversibility** — migrations are **forward-only**; an older app refuses a migrated vault. To go back, restore the **pre-migration backup** with that older build.

**Developer contract (maintained as the format evolves)**
- Release tags are `v<main>.<minor>` (for example `v0.1`, `v1.2`). After shipping and tagging a release, immediately bump the working app version in `package.json` to the next release (for example `v1.0` shipped → working version `1.1`).
- The latest `v*` tag is the last shipped release baseline. All vault-format-affecting changes after that tag are part of the current `package.json.version` release and must either add/update a migration guide entry or explicitly state why no migration is needed.
- Never repurpose an existing key in place. To change shape, add a migration step (added / renamed / removed / transformed) and bump `APP_SCHEMA_VERSION` **in the same release**.
- **Additive, optional *container* fields** that older builds can safely ignore (e.g. `wrapped_biometric`, §4.7) do **not** bump `container.version` and need **no migration step** — they carry no data to transform and cause no loss. They must still be documented here and confirmed by `$verify` as a deliberate, non-breaking addition. Anything that changes how an *existing* field is read (or that an older build cannot ignore) **does** bump `container.version`, and older builds then refuse it (§11.2 step 1).
- Each step owns **both** its transform *and* its change list — the guide is generated from these, so the docs and the behavior can't drift.
- Migrations are pure, ordered, forward-only, and unit-tested against old-schema fixtures; a failed step leaves the original file untouched.

**OwnKeep identity-finalization decision (working release 1.2; baseline `v1.1`):** bump
`container.version` from 2 to 3 because the existing magic field now writes the OwnKeep-native
`OWNK` marker and earlier builds cannot read it. The v1.2 reader accepts v1–v2 marker bytes and
stamps v3 only on an accepted vault mutation. New and regenerated recovery codes use the OwnKeep
HKDF context; recovery unlock tries the v0 context only after the current context fails, preserving
every existing Emergency Kit. The app-data path is now exclusively `com.shaojiang.ownkeep`, and
Touch ID uses the matching Keychain service. There is **no `APP_SCHEMA_VERSION` bump or TypeScript
migration-registry step** because the encrypted model is unchanged; Rust container/KDF regression
tests cover the format transition and backup restore remains filename-agnostic.

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

- **Permissions:** Accessibility (global hotkey — with graceful tray fallback if denied), Notifications, and — when Touch ID is enabled — Biometric unlock via LocalAuthentication + a biometric-gated Keychain item (§4.7; optional, off by default, graceful fallback to the master password if the sensor is absent or the prompt is denied).
- **Activation policy:** tray/menu-bar app; optionally `Accessory` (no Dock icon) so it feels like a launcher.
- **Signing & notarization:** Developer ID sign + notarize so Gatekeeper allows it and permission prompts behave well. (Fine to defer during early dev with an ad-hoc/self-signed build; do it before "daily driver" use.) Touch ID additionally needs a **stable code-signing identity**: the biometric Keychain item is bound to the app's signature, so re-signing with a different identity (or an ad-hoc rebuild) can invalidate it → re-enroll (the master password is unaffected).
- **Auto-update (optional):** Tauri updater plugin — but it needs network; keep it opt-in and off by default to honor offline-first.

---

## 13. Adding a Feature Later (developer guide)

This is the payoff of the module registry — the flexibility you asked for:

1. Create `modules/<feature>/` with an object implementing `FeatureModule` (§3.4): `id`, `buildIndex`, `ListView` (dashboard content), `DetailView`, `EditView`, optional `SettingsPanel`, optional `collectReminders`, and `secretFields` if it holds secrets.
2. Add its initial slice via `createEmpty()`; the model gains `modules.<id>` with **no migration to other slices**.
3. Register it in `modules/index.ts`.
4. It automatically appears in: the **Dashboard sidebar** (its `ListView` in the right pane), the Modules settings tab (with enable + searchable toggles + its panel), the scheduler (if it has reminders), and — when `searchable` — the unified search index and scope-prefix routing.

**UI & tests:** build the module's `ListView` / `DetailView` / `EditView` from the shared **shadcn/ui** primitives + **Lucide** icons so it matches the app automatically, and add a **Vitest** test file covering its pure logic (index / parse / math / reminders) — see §2.1–2.2.

**Rust side:** stays module-agnostic. It only needs each module's `secretFields` (passed down from
the registry) to redact the projection and to service `copy_secret(itemId, field)`. Non-secret
modules round-trip their data to JS freely.

---

## 14. Open Questions / Risks

- **Concealed clipboard needs native Rust** — the Tauri plugin can't set `ConcealedType`; budget a small objc2/cocoa shim. Verify it works with your clipboard-history tool of choice.
- **Clipboard capture by Handoff / third-party managers** — mitigations reduce but don't eliminate; document honestly in-app.
- **Recovery-code custody** — the code unlocks everything; the Emergency Kit must not be stored beside the vault. Consider a minimum-friction "have you saved it?" confirm at setup.
- **Biometric unlock key custody (§4.7)** — enabling Touch ID stores a device-local wrapping key in the macOS Keychain, the one exception to "one encrypted file." It's opt-in and offline, but (a) ties unlock to anyone who can satisfy Touch ID while the macOS session is unlocked, (b) is invalidated by a fingerprint-set change or a code-signing-identity change (→ re-enroll; the password still works), and (c) is **excluded from every backup** and cleared on restore/erase, so it never travels with the vault — a restored vault re-enrolls Touch ID from scratch. Keep it off by default and documented honestly in-app.
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
- **Rust crates:** `argon2`, `chacha20poly1305`, `hkdf`, `sha2`, `getrandom`, `zeroize`, `bip39` (12-word recovery), `base64`, `serde` / `serde_json`; `objc2` (clipboard shim, Phase 3); `security-framework` + `objc2-local-authentication` (Touch ID biometric unlock — Keychain `SecAccessControl` + `LAContext`, macOS-only, Phase 13, §4.7). *(`getrandom` is used directly for keys/nonces/salts instead of `rand`; auto-lock uses a std background thread, so no direct `tokio`.)*
- **Frontend:** `react`, `typescript`, `tailwindcss`, `zustand`, `fuse.js`, `shiki`, `lucide-react`, **shadcn/ui** (`cmdk`, `@radix-ui/*`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss-animate`, `sonner`); **`motion`** (Motion/React — calm press/presence animations, respects `prefers-reduced-motion`); `uplot` (Finance module only).
- **Testing:** `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom` (frontend); `cargo test` + `proptest` (Rust). *(Future E2E: `tauri-driver` + `webdriverio`.)*
- **Dropped from v1 (re-add with a Notes module):** `codemirror`/`milkdown`, `react-markdown`, `remark-gfm`, `rehype-sanitize`.

---

*See [plan.md](plan.md) for the phased development schedule.*
