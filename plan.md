# OwnKeep — Development Plan & Schedule

Companion to [spec.md](spec.md). A phased, dependency-ordered build for a **solo developer**,
optimized for getting a genuinely useful app **running on macOS as early as possible**, then
layering optional modules on the stable core.

**Author:** Shaojiang · **Start:** 2026-07-06 · **Status:** Planning

---

## Assumptions & pace

- **Solo, part-time** (~10–15 focused hours/week). Estimates are in **focused days** (≈4–5 hrs each) plus a suggested calendar week.
- **Full-time pace** compresses the MVP (Phases 0–6) to roughly **2–3 weeks** instead of ~6.
- **Learn-as-you-go Rust** is baked into the Phase 1 estimate (the crypto surface is small and uses well-trodden crates).
- Weekly anchors below are +7-day increments from the start; slip freely — the **order** matters more than the dates.

---

## Milestone overview

| Phase | Focus | Exit criteria | Est. | Week (from) |
|---|---|---|---|---|
| **0** | Scaffolding, shell, UI kit + tests | Hotkey toggles an empty window; tray alive; shadcn + Lucide wired; `pnpm test` + `cargo test` green | 2 d | W1 · 2026-07-06 |
| **1** | 🔐 Crypto core (Rust) | Create-vault, unlock (password **and** recovery code), auto-lock, atomic writes — all unit-tested | 3–5 d | W1–W2 · 07-06 |
| **2** | App shell + registry + **Dashboard shell** | `FeatureModule` contract, registry, Dashboard (sidebar + content pane), onboarding (+ Emergency Kit), settings shell | 3–4 d | W3 · 07-20 |
| **2.1** | 🔀 Versioning, migration guide & migrations | v(N) vault opens in a v(N+1) build through a user-aware migration guide; pre-migration backup; newer vault refused safely | 1–2 d | W3 · 07-20 |
| **2.2** | 🧪 Unit-test coverage to >95% | Coverage tooling for TS **and** Rust; missing unit tests added; `pnpm coverage` + Rust coverage both **>95%**, enforced by config and `/verify` | 1–2 d | W3 · 07-20 |
| **3** | 🔑 Passwords module (F1) | Add/edit/delete; **concealed-clipboard copy** never touches the DOM | 2–3 d | W3–W4 · 07-20 |
| **4** | ⌨️ Command bar (F10) | Unified index, fuzzy **+ frecency**, scope prefixes, numbered copy | 2–3 d | W4 · 07-27 |
| **5** | 📋 Commands module (F2) | Shiki highlighting, `{{ }}` placeholders, **interactive fill-in** + raw copy | 2–3 d | W5 · 08-03 |
| **6** | 💾 Backup/restore + settings | Backup round-trips; restore is atomic + gated by decryption; hotkey/theme config | 2–3 d | W5–W6 · 08-03 |
| **━━ MVP LINE ━━** | **v0.9 — useful private password + command launcher** | Daily-drivable | — | **~W6 · 2026-08-10** |
| **7** | 🔔 Scheduler infra (§8) | Tray-alive interval task, `collectReminders` plumbing, de-dupe, notif permission | 1–2 d | W7 · 08-17 |
| **8** | ✅ Todos module (M1) | Add/complete/recurring; due reminders fire once per window | 1–2 d | W7 · 08-17 |
| **9** | 🔁 Subscriptions module (M2) | Track + reschedule; lead-window reminders; monthly/annual summary | 1–2 d | W8 · 08-24 |
| **10** | 📈 Finance module (M3) | Snapshots, by-category stats, uPlot trend, manual FX table | 2–3 d | W8–W9 · 08-24 |
| **11** | ✨ Polish + ship | Theming, a11y, sign + notarize, packaging, README | 2–4 d | W9–W10 · 08-31 |
| **12** | 🧹 UI wrap up + bugfixes | Dashboard list UX improvements (sorting, column resize, detail modals, password quick actions, commands category layout) ship polished | 2–5 d | W10+ · 2026-09 |
| **━━ v1.0 ━━** | **Signed, notarized release** | — | — | **~W10 · 2026-09-07** |
| **13** | 🔐 Touch ID unlock (optional) | Enroll while unlocked → Touch ID = unlock path C; master password + recovery are the authoritative auth; device-local Keychain key excluded from backups (re-enroll after restore); enable/disable/re-enroll in Settings; no model-schema migration | 2–3 d | W11+ · 2026-09 |

---

## The MVP (Phases 0–6) is the priority

Everything through Phase 6 delivers the two **key features you named** — password vault + command
lines — plus backup/restore and configuration. That's a complete, secure, daily-usable product.
Phases 7–11 are additive modules on an already-stable core; each can slip without blocking use.

**Fastest path to "running on my Mac":** **P0 → P1 → P2 → P2.1 → P3** gives an unlockable password vault
with a **browsable Dashboard** (sidebar + content pane) and a safe upgrade path before real password data lands (~2 weeks part-time).
**+P4 → P5** adds the command-bar launcher on top.

---

## Detailed phases

> **Testing is per-phase, not a phase of its own:** every module ships Vitest tests for its pure logic (parsers, ranking, math, reminders) and the Rust core ships `cargo test` / `proptest`; each phase's Exit criteria include green tests. See spec §2.2.

### Phase 0 — Scaffolding, shell, UI kit + test setup · 2 d
- [x] `create-tauri-app` (React + TS template); Tailwind + Zustand; strict CSP; devtools off in prod.
- [x] **UI kit:** `shadcn init` (components.json, `@/` path alias, CSS-variable theme tokens, `tailwindcss-animate`); add `lucide-react`; scaffold first components — `button input command`.
- [x] **Test setup:** Vitest + React Testing Library + `@testing-library/user-event` + jsdom; wire `pnpm test`, coverage, ESLint, and Prettier format checks; confirm `cargo test` runs. One trivial passing test on each side.
- [x] Add plugins: `global-shortcut`, `notification`, `fs`, `dialog`, `single-instance`.
- [x] Tray icon + `ActivationPolicy::Accessory`; window hides on blur/Esc, shows on hotkey.
- [x] Global hotkey (`Cmd+Shift+Space`) toggles an empty search window; single-instance re-focuses.
- [x] Write `README.md` with project setup, dev run, test, production build/run, and troubleshooting instructions.
- **Exit:** hotkey summons an empty window from any app; app survives window close (tray); `pnpm test` **and** `cargo test` run green.
- **Deps:** none.

### Phase 1 — 🔐 Crypto core (Rust) · 3–5 d · *the make-or-break phase*
- [x] Container format (§4.2): `magic/version/kdf/salts/wrapped_master/wrapped_recovery/vault`.
- [x] `Argon2id(master)` → `KEK_master`; `HKDF-SHA256(recovery_code)` → `KEK_recovery`.
- [x] Random `DEK`; XChaCha20-Poly1305 encrypt vault; AEAD-wrap DEK under both KEKs (envelope, §4.1).
- [x] Tauri commands: `create_vault`, `unlock(password)`, `unlock_recovery(code)`, `lock`, `change_master`, `regenerate_recovery`.
- [x] Recovery-code generation (12-word list) + **Emergency Kit** payload.
- [x] In-Rust decrypted model; **auto-lock timer** + `zeroize` on lock/quit; optional failed-attempt backoff.
- [x] **Atomic writes** (temp → `fsync` → rename).
- [x] **Unit tests (`cargo test` + `proptest`):** wrong-password rejects; both unlock paths recover the same DEK; tamper → AEAD fail; round-trip encrypt/decrypt; re-wrap after `change_master`; property-test random keys/inputs.
- **Exit:** create a vault, lock, reopen with password AND with recovery code; corrupting a byte fails cleanly.
- **Deps:** P0. **Do not build features until this is solid and tested.**

### Phase 2 — App shell + module registry + Dashboard shell · 3–4 d
- [x] `FeatureModule` interface (incl. `ListView`) + `MODULES` registry (§3.4); Zustand store for the decrypted projection.
- [x] Unified-index plumbing (empty until modules land) with Fuse.js + a frecency booster stub.
- [x] **Dashboard shell (§7.5):** left sidebar (one row per enabled module, from the registry) + right content pane rendering the selected module's `ListView`; `Cmd+Shift+D` toggles the window; sidebar nav (`↑/↓`, `⌥⇧1..9`).
- [x] Lock screen + **onboarding**: cold start shows the main window; set master password (with vault path shown) → **show Emergency Kit** → confirm hotkeys (rebinding lands with the Settings polish). Lock screen offers recovery unlock, plus backup-then-erase when both credentials are lost.
- [x] Settings shell with a **Modules** tab (enable toggles) rendered from the registry; System shows the vault file path.
- **Exit:** first-run onboarding completes; lock/unlock cycles; the Dashboard sidebar lists enabled modules and switches panes (empty `ListView`s OK until modules land).
- **Deps:** P1.

### Phase 2.1 — 🔀 Versioning, migration guide & migrations · 1–2 d
*Lock in the forward-migration framework **now** — before Phases 3–10 start adding real module data — so every future schema change has a tested path and old vaults never break. The `.app` can already be replaced freely (data lives outside the bundle); the real "don't lose data" risk is schema drift, so this phase makes app/schema/container versions actionable (§11).*
- [x] **Release-version source:** define the current working app version from `package.json.version` exactly (product format `main.minor`); inject it as `APP_VERSION`; stamp `meta.appVersion` on create/save/migration; show `OwnKeep v<APP_VERSION>` at the bottom of the Dashboard sidebar. Treat the latest `v*` Git tag as the last shipped release baseline, not as the current working version.
- [x] **Version compare helper:** parse `main.minor` into integer pairs; refuse a vault whose `meta.appVersion` or `meta.schemaVersion` is newer than the running app with the old-version message from spec §11.2.
- [x] **Model migration registry (TS):** an ordered registry of pure `migrate(vN -> vN+1)` steps keyed on `meta.schemaVersion`; each step owns its transform plus `changes[]` (`added`, `renamed`, `removed`, `transformed`) so the migration guide is generated from the same source that migrates data.
- [x] **Migration guide UI:** after unlock, when `vault.schemaVersion < APP_SCHEMA_VERSION`, show the union of pending change lists before any write; summarize additive fields, show rename paths (`old -> new`), and render removals in red as data loss.
- [x] **Accept / reject flow:** Accept writes a versioned pre-migration backup, applies migrations, stamps `APP_VERSION` + `APP_SCHEMA_VERSION`, re-seals, and atomically writes; Reject offers **Back up & quit**, **Erase & start fresh** (red danger confirm), or **Quit** with no vault writes.
- [x] **Container/envelope versioning (Rust):** keep version-tagged readers so a newer build can still decrypt an older container; after deriving the DEK, if `container.version < CURRENT`, re-seal into the current format and persist only after the user accepts the migration path. Reject newer-than-known versions before unlock.
- [x] **Versioned backups:** backup names include the vault/app version (`ownkeep-v<appVersion>-<timestamp>.dat`; pre-migration `ownkeep-pre-migration-v<old>-to-v<new>-<timestamp>.dat`), and backups preserve `container.version`, `meta.appVersion`, and `meta.schemaVersion`.
- [x] **Tests:** version comparison; old-schema fixture migrates to current with data intact; added keys hydrate silently; renamed keys preserve values; removed keys appear in the guide as data loss; rejecting migration writes nothing; a failing step leaves the original file untouched; newer app/schema/container versions are refused safely.
- [x] **AI verification hook:** update `$verify` / `/verify` instructions so every data-shape change after the latest `v*` release tag is checked for a migration guide entry, a `package.json.version` current-release check, and tests.
- **Exit:** a v(N) vault opens in a v(N+1) build only through the migration-guide flow; accepting creates a versioned pre-migration backup and preserves data except user-confirmed removals; rejecting leaves the vault untouched or exits through an explicit backup/erase path; older app builds refuse newer vaults.
- **Deps:** P2 (model shape settled); borrows the P1 atomic-write helper; anticipates P6 backup.

### Phase 2.2 — 🧪 Unit-test coverage to >95% · 1–2 d
*Lock in a high coverage bar **now**, on the small pre-feature codebase (Phases 0–2.1), so every later phase inherits the discipline instead of back-filling tests once the surface is large. Coverage is a standing `/verify` PASS gate (spec §2.2): line coverage must stay **>95% on both surfaces**.*
- [x] **Coverage tooling (TS):** configure Vitest v8 `coverage.thresholds` at **95%** (lines/statements/functions/branches) in the Vitest config; confirm `pnpm coverage` fails when under the bar. Decide global vs. per-file enforcement.
- [x] **Coverage tooling (Rust):** add `cargo llvm-cov` (install + a `coverage` script, e.g. `cargo llvm-cov --fail-under-lines 95`); document running both in the README.
- [x] **Measure the gap:** run both and list every file/area under 95% — likely the UI components (`Dashboard`, `CommandBar`, onboarding / lock / reset / emergency-kit / migration screens), store error branches, `lib/window`, and Rust command / error paths not hit by unit tests.
- [x] **Add the missing unit tests:** close the gaps — component render/interaction (React Testing Library), store error/edge branches, Rust command + error-path tests — testing **behavior, not implementation** (spec §2.2); keep pure logic separated so tests stay DOM-free where possible.
- [x] **Enforce:** thresholds fail the coverage run below the bar, and `/verify` runs coverage on both surfaces and treats ≤95% (or an unmeasurable surface) as a blocking FAIL.
- **Exit:** `pnpm coverage` **and** Rust coverage both report **>95%** (lines), enforced by config; `/verify` runs both and fails under the bar.
- **Deps:** P2.1. A cross-cutting quality gate — land it before Phase 3 so real feature code is built on top of an enforced bar.

### Phase 3 — 🔑 Passwords module (F1) · 2–3 d · *proves the security model*
- [x] `passwordsModule`: `secretFields: ["password"]`, `buildIndex`, `ListView` (masked dashboard list), `DetailView`, `EditView`.
- [x] Rust **`copy_secret(id, field)`** → **concealed pasteboard** (custom objc2/cocoa shim) + auto-clear timer; reveal-on-demand.
- [x] CRUD; masked display; click-to-open login/recovery URLs.
- **Exit:** create/edit/delete entries; the passwords `ListView` renders in the Dashboard with masked values; copy a password with it **never appearing in the DOM** (verify in devtools); pasteboard clears after N s and is ignored by a clipboard-history tool.
- **Deps:** P2.1. Front-loaded to validate §4.5 end-to-end early, after migrations are safe for real password data.

### Phase 4 — ⌨️ Command bar (F10 / §7) · 2–3 d
- [x] Bar shell = shadcn **`command`** (`cmdk`) with `shouldFilter={false}`; unified index across enabled modules; **fuzzy (Fuse.js) × frecency** ranking; update `frecency` on use.
- [x] Scope prefixes (`p `, `c `, …); result list capped at `resultLimit`, numbered 1–9.
- [x] Keyboard nav (`↑/↓`, `⌥⇧<n>` primary action, `Enter`/click runs it); Esc/blur hides.
- [x] **Tests:** ranking (fuzzy×frecency ordering) + scope-prefix parsing (Vitest).
- **Exit:** typing filters passwords instantly; `⌥⇧1..9` runs the primary action; frecency reorders repeats.
- **Deps:** P3.
- **Bridge (shipped):** non-password / non-command bar hits open the Dashboard on that module's pane and hide the launcher (module pane only — no per-item focus). Password/command hits keep copy / fill-in. Surfaces are mutually exclusive; traffic-light close confirms then quits the app.

### Phase 5 — 📋 Commands module (F2) · 2–3 d
- [x] `commandsModule`: category/title/description/snippets; Shiki highlighting; `ListView` (grouped by tag).
- [x] `{{name}}` parser; typed `arguments` (text/enum); **interactive fill-in form** (Tab/Shift-Tab, Enter=copy completed).
- [x] Raw-copy secondary action (`⌥⌘<n>` / `Opt+Enter`).
- [x] **Tests:** `{{ }}` parse (names, reuse, invalid) + fill substitution + raw-vs-filled output (Vitest).
- **Exit:** a mid-string placeholder (`docker run -p {{port}}:{{port}} {{img}}`) fills correctly; raw copy preserves `{{ }}`; snippets highlight.
- **Deps:** P4.

### Phase 6 — 💾 Backup/restore (§11) + Settings UI (§9) · 2–3 d
- [x] Backup: file dialog → copy encrypted container with versioned filename (`ownkeep-v<appVersion>-<timestamp>.dat`).
- [x] Restore: pick file → decrypt-verify → warn → optional `pre-restore` snapshot → atomic replace → reload.
- [x] Settings UI: hotkeys, clipboard clear, theme/accent, result limit, per-module toggles; Emergency Kit regen. *(Auto-lock timeout — configurable presets incl. never, wired to the Rust idle timer — was pulled forward and shipped in Phase 2.1.)*
- **Exit:** backup→restore round-trips on a fresh machine; backup filename includes the vault/app version; restore refuses a wrong password; settings persist (encrypted).
- **Deps:** P5. **← MVP / v0.9 ends here.**

### Phase 7 — 🔔 Scheduler infra (§8) · 1–2 d
- [x] Tray-alive interval task + wake-from-sleep; calls each enabled module's `collectReminders`.
- [x] De-dupe (last-notified per item); request notification permission; native notify.
- [x] **Tests:** last-notified windowing / de-dupe logic (Vitest, or `cargo test` if the scheduler lives in Rust).
- **Exit:** a dummy reminder fires once; app notifies while the window is hidden.
- **Deps:** P6.

### Phase 8 — ✅ Todos module (M1) · 1–2 d
- [x] `todosModule`: title/notes/done/dueAt/priority/category; `none|daily|weekly` recurrence; `collectReminders`; `ListView` (checklist).
- [x] Bar action: open Dashboard → Todos; checking Done marks the item done in the Dashboard (including recurring).
- [x] **Tests:** recurrence rollover (daily/weekly) + `collectReminders` windowing/de-dupe (Vitest).
- **Exit:** overdue todo notifies once per window; completing a weekly todo reschedules.
- **Deps:** P7.

### Phase 9 — 🔁 Subscriptions module (M2) · 1–2 d
- [x] `subscriptionsModule`: service/url/amount/currency/cycle/nextDueDate/autoRenew/lead/notes; `collectReminders`; `ListView` (table + monthly/annual summary header).
- [x] Editing cycle/due reschedules; monthly total + annualized summary view.
- [x] **Tests:** next-due recompute per cycle (weekly/monthly/yearly/custom) + annualized summary math (Vitest).
- **Exit:** lead-window reminder fires; summary totals correctly (via finance FX if enabled).
- **Deps:** P7 (independent of P8 — can swap order).

### Phase 10 — 📈 Finance module (M3) · 2–3 d
- [x] `financeModule`: `Snapshot[]` of `{place,holder,category,amount,currency,dueDate?}` entries; total + by-category **derived on the fly** (a rate edit re-totals). Holder / category option lists live in Finance settings (`holderOptions` / `categoryOptions`).
- [x] Manual **FX rate table** (base currency + rates in `settings.modules.finance`); convert to `baseCurrency`; **uPlot** net-worth trend.
- [x] `ListView` (dashboard): the uPlot trend atop the right pane + the snapshot table + by-category detail.
- [x] **Tests:** total + by-category + FX conversion; re-total after a rate edit (Vitest).
- **Exit:** adding a snapshot updates totals + curve; editing a rate re-totals all snapshots.
- **Deps:** P2 (data), independent of P7–P9.

### Phase 11 — ✨ Polish + ship · 2–4 d
- [x] Theming pass (light/dark/accent), empty states, error toasts, keyboard-map help. *(Theming was wired earlier; later polish locked Color Hunt periwinkle-mist light + midnight-navy dark tokens with default accent `#5B6CFF`, per-module empty states + in-panel New, CommandBar no-results, sonner toasts, and a `⌘H` keyboard-shortcut cheat sheet on both surfaces.)*
- [ ] Accessibility check; performance check (<300 ms to bar, <30 ms keystroke). *(In progress: added `nav`/`aria-current` on the Dashboard sidebar, `scope="col"` on module tables, `role="status"`/`aria-live` feedback via toasts + the no-results region, and `aria-busy`/`role="alert"` on onboarding. Performance measurement still pending.)*
- [x] Motion UI polish: calm press/presence animations on shared primitives (`button`, `switch`, `select`, `checkbox`, `ButtonGroup` active pill), EmptyState / KeyboardHelp overlays, CommandBar result stagger, and Dashboard sidebar taps (shared sliding active pill) — all reduced-motion aware via `useReducedMotion` ([Motion](https://motion.dev/)). *(Input stays a plain native field — focus scale made the placeholder jump.)*
- [x] **Create/edit form chrome:** shared `ItemFormShell` — dimmed pane + elevated dialog card with Creating/Editing badge; Esc + backdrop dismiss (all module New/Edit flows).
- [x] **Window exclusivity + quit-on-close:** command bar and Dashboard never show together; traffic-light close confirms then quits the whole app (Esc/blur still only hides the launcher).
- [x] **OwnKeep product rebrand:** rename user-facing copy, package/crate metadata, bundle identity,
  backup prefixes, docs, agent tooling, and website to OwnKeep / `ownkeep.app`; when the new
  `com.shaojiang.ownkeep` app-data path is empty, validate and atomically copy the former vault
  without deleting it. Keep historical crypto format identifiers stable. **No schema/container
  bump:** the encrypted model is unchanged and restore accepts old `.dat` backup names.
- [ ] **Developer ID sign + notarize**; DMG/`.app` packaging; README + Emergency-Kit docs + migration-guide docs. *(Docs done: README now has a "Using OwnKeep" section covering the Emergency Kit / recovery code, keyboard shortcuts, theme, and the upgrade/migration-guide flow. Signing, notarization, and DMG packaging still pending.)*
- [ ] **Release bookkeeping:** tag shipped commits as `v<main>.<minor>`; immediately after a shipped tag, bump the working app version in `package.json` to the next release version (`main.minor`), run `node scripts/sync-version.mjs` to derive SemVer-only package metadata, and keep those derived fields from becoming a second app-version source.
- **Exit:** Gatekeeper opens it clean on a second Mac; permissions prompt correctly; the shipped `.dmg` includes the migration guide for every schema step since the previous `v*` tag. **← v1.0.**
- **Deps:** all prior.

### Phase 12 — 🧹 UI wrap up + bugfixes (Dashboard-first UX) · 2–5 d
*Post-v1.0 ergonomic improvements discovered during manual testing. Scope is intentionally UI-only:
no changes to the crypto core or vault format unless explicitly required (and if the data shape
changes, update migrations + the migration guide in the same release per spec §11.2 and the Phase
2.1 contract).*

- [x] **Sortable module tables:** on every Dashboard module screen that uses a table, clicking a
  column header sorts the list (toggle ascending/descending, stable).
- [x] ~~**Resizable table columns:**~~ removed after manual testing — fixed proportional columns
  are sufficient; drag handles were hard to use and clipped header labels.
- [x] **Detail-on-demand modal:** remove the persistent right-side detail column from Dashboard module
  panes.
  - [x] Add a `View` icon/button in the `Actions` column for each row.
  - [x] Clicking `View` opens a modal listing item details (read-only), with Edit/Delete/Copy actions
    as appropriate.
  - [x] Keep the list the primary interaction surface; modals should be dismissible via Esc and
    click-away.
- [x] **Passwords list quick actions (Dashboard only):**
  - [x] Clicking the masked password (`*****`) reveals via Rust `reveal_secret` (native dialog —
    plaintext never enters the WebView) **without closing the Dashboard**.
  - [x] Add a `Copy` icon/button next to the masked password that copies immediately to the
    concealed clipboard.
  - [x] Ensure secrets still never enter the WebView by default — reveal/copy must keep using the
    Rust `reveal_secret` / `copy_secret` path (spec §4.5).
- [x] **Commands list layout (Dashboard):** replace the Commands table with a category-grouped
  layout:
  - [x] Sections per category (e.g. “Git”, “MongoDB”) and within each section, render each command
    as: title + description, then syntax-highlighted snippet below.
  - [x] Keep the existing filter box and “New” affordance.
- [x] **Help in the Dashboard sidebar:** remove the floating bottom-right keyboard-help icon on the
  Dashboard. Add a **Help** row to the left sidebar’s bottom menu (with Settings and Lock), styled
  like other sidebar rows: `[Keyboard icon] Help` plus the shortcut label **`⌘H`** on the right.
  Clicking the row opens the same Hotkey Help modal; `⌘H` continues to toggle it globally.
- [x] **About in the Dashboard sidebar:** **About** row below Help (`⌘/`) opens a modal with
  features, developer email, version, release date, and website (`https://ownkeep.app`); hotkey
  works on the command bar too.
- [x] **Command-bar searchable modules:** per-module `searchable` setting (schema v9); defaults on
  for passwords + commands only; Settings Modules row toggles Search + Enabled; unified index and
  scope prefixes honor `searchable`.
- [x] **Dashboard sidebar hotkeys:** module jump chord aligned with the command bar — `⌥⇧1..9`
  (was `⌘1..9`); help sheet + sidebar hints updated.
- **Exit:** manual test pass confirms the Dashboard is list-first and fast to scan; common actions
  (view/copy/edit) are reachable with fewer clicks; no regression in secrets exposure rules; `pnpm
  check` stays green.
- **Deps:** Phase 11 (polish baseline).

### Phase 13 — 🔐 Biometric unlock · Touch ID (optional) · 2–3 d
*Post-v1.0, opt-in convenience (spec §4.7): on a Touch ID Mac, unlock with a fingerprint instead of
the master password. **The master password and recovery code are the only authoritative
credentials — they always unlock; Touch ID is strictly a secondary shortcut.** It is an
**addition**, never a replacement: enrolling requires an already-unlocked vault, and losing,
disabling, or never enabling Touch ID never locks the user out. Mechanism = a **third envelope wrap**
(mirrors §4.1): a random `KEK_biometric` lives in the macOS Keychain behind a biometric-gated
`SecAccessControl` and wraps the same DEK into an optional `wrapped_biometric` container field.
Honors the non-negotiables — fully offline (LocalAuthentication + Keychain, no network) and the
wrapping key never enters the WebView (§4.5) — with **one flagged exception**: a device-local
wrapping key now lives in the Keychain, the sole break from "one encrypted file" (spec §4.7/§14),
unavoidable for biometric unlock, opt-in, and off by default.*

*Backups & portability (spec §11): Touch ID enrollment is **device-local and never included in a
backup** — `wrapped_biometric` is stripped from every backup, so a restored (or copied) vault has
Touch ID off and is re-enrolled **fresh, like new**. The backup UI notifies the user of this when
Touch ID is enrolled; restore/erase also clear the device-local Keychain item.*

*Data-shape note (spec §11.2 / AGENTS guardrail): the encrypted model is **unchanged** — enrolled
state is derived in Rust, so there is **no `meta.schemaVersion` bump and no model migration**. The
container gains only the **optional, additive** `wrapped_biometric`; it does **not** bump
`container.version` (older builds ignore it and still unlock via password/recovery). Document it as
a reviewed, non-breaking container addition and keep `$verify` honest.*

- [x] **Envelope third wrap (Rust):** add optional `wrapped_biometric: Option<SealedBlob>` to
  `Container` (`src-tauri/src/container.rs`; `#[serde(default, skip_serializing_if = "Option::is_none")]`,
  **no `container.version` bump**). Add `envelope::wrap_biometric`, `envelope::unlock_with_biometric`,
  and `envelope::clear_biometric` (`src-tauri/src/envelope.rs`) — pure, unit-testable like the
  existing wraps.
- [x] **Keychain + LocalAuthentication shim (Rust):** a `src-tauri/src/biometric.rs` that stores /
  reads / deletes a random 256-bit `KEK_biometric` as a Keychain item with
  `SecAccessControl(BiometryCurrentSet, WhenUnlockedThisDeviceOnly)`, non-synchronizable; prompts
  Touch ID via `LAContext` (reason "Unlock OwnKeep"); and probes availability (`canEvaluatePolicy`).
  Crates: `security-framework` + `objc2-local-authentication` (macOS-only target, beside the Phase 3
  `objc2` clipboard shim). Put the OS calls behind a small trait so session/command logic stays
  testable without hardware.
- [x] **Session + commands (Rust):** `enable_biometric_unlock` (requires unlocked → gen key, store in
  Keychain, wrap DEK, persist), `disable_biometric_unlock` (delete Keychain item + clear wrap +
  persist), `reenroll_biometric_unlock` (disable → enable, for "update" / after a fingerprint-set
  change), `unlock_biometric` (prompt → Keychain → unwrap → decrypt, like `unlock_password`), and
  `biometric_status` → `{ available, enrolled }`. Wire into `session.rs` + `commands.rs`
  (`generate_handler!`).
- [x] **Backup/restore hygiene (Rust):** the backup commands (`backup_vault*`, plus pre-migration /
  pre-restore snapshots) write the container **without** `wrapped_biometric` (device-local, §4.7/§11);
  `restore_*` and `erase_vault` delete the local biometric Keychain item so no orphan key remains. A
  restored vault reports Touch ID *not enrolled* and can be re-enrolled fresh.
- [x] **Frontend API + store + lock screen:** add `biometricStatus`, `enableBiometric`,
  `disableBiometric`, `reenrollBiometric`, `unlockBiometric` to `src/vault/api.ts` and the vault
  store (keep `invoke` behind the api boundary). In `LockScreen.tsx`, when `available && enrolled`,
  show an **"Unlock with Touch ID"** button (optionally auto-prompt once); a failed/canceled prompt
  falls back to the password field. Master password + recovery stay always available.
- [x] **Settings control (System → Security):** in `SettingsPanel.tsx`, add a Touch ID control that
  **enables, disables, or re-enrolls ("update")** based on `biometric_status`; render an
  unavailable/hardware-missing state gracefully. In the **Backup & restore** section, show a
  **notice** — whenever Touch ID is enrolled — that biometric unlock isn't included in backups and
  must be re-enabled after restoring.
- [ ] **Packaging + docs:** ensure the app is **code-signed** so the Keychain item + LocalAuthentication
  behave (spec §12); document the reason string, the `WhenUnlockedThisDeviceOnly` attributes, and the
  re-sign / fingerprint-change invalidation caveat; record the additive container field per §11.2 and
  bump `package.json.version` per the release-bookkeeping contract when shipping. *(Docs done — spec
  §4.7/§11.2/§12 written and the additive container field recorded; code-signing + notarization + the
  version bump ride the Phase 11 release step, still pending.)*
- [x] **Tests:** Rust — `wrap_biometric`/`unlock_with_biometric` recover the same DEK as
  password/recovery; `clear_biometric` disables path C while both other paths still unlock; the
  backup path **omits** `wrapped_biometric` and the result still restores via password/recovery; a
  container **without** the field parses (`None`) and one **with** it round-trips and is ignored by an
  old-shape reader (backward-compat). Frontend (Vitest) — LockScreen shows/hides the Touch ID button
  per mocked `biometric_status` and falls back to the password on failure; SettingsPanel
  enable/disable/re-enroll call the right API and the backup notice shows only when enrolled. Keep
  coverage **>95%** on both surfaces (Phase 2.2 bar); mock the Keychain/LAContext boundary and
  validate the native path manually.
- **Exit:** the **master password and recovery code always unlock** and are the only authoritative
  credentials (disabling/losing Touch ID never locks the user out). On a signed build, enrolling
  while unlocked stores a biometric-gated key and Touch ID unlocks the vault (path C);
  enable/disable/re-enroll work from Settings → System → Security; **backups exclude
  `wrapped_biometric`** and show the notice, and a restored vault has Touch ID off and can be
  re-enabled fresh; an absent sensor, denied prompt, or fingerprint-set change falls back cleanly to
  the password with **no data-shape change**; older builds still open a biometric-enrolled vault via
  password/recovery; `pnpm check` + coverage stay green.
- **Deps:** Phase 12 (post-v1.0 baseline). Builds on the Phase 1 envelope, the Phase 3 `objc2`
  clipboard shim (same native tooling), the Phase 6 lock/settings + backup/restore surfaces, and the
  Phase 11 signing story.

---

## Definition of Done — v1.0

- Unlock via master password **and** recovery code; auto-lock + zeroize verified.
- Secrets never enter the WebView; concealed clipboard confirmed against a history tool.
- Command bar: fuzzy+frecency, scope prefixes, numbered copy, interactive fill-in.
- Dashboard: sidebar lists enabled modules; each renders its full content (`ListView`) in the right pane; secrets stay masked.
- Dashboard: left-sidebar footer shows the current app version.
- Backup/restore is atomic and decryption-gated.
- Manual upgrade path is safe: older vaults show a migration guide; accepting creates a versioned pre-migration backup; rejecting can back up+quit, erase+continue, or quit untouched; older app builds refuse newer vaults.
- Every enabled module toggles cleanly from Settings with data preserved.
- Migration guide is maintained for every data-shape change since the latest `v*` release tag, with removals flagged as red data loss and renames showing old→new paths.
- Tests green **and unit-test coverage >95% on both surfaces**: **Vitest** (frontend logic) + **`cargo test` / `proptest`** (crypto); each module's pure logic covered; enforced by config and `/verify` (Phase 2.2).
- Signed + notarized; opens on a clean Mac without warnings.

---

## Sequencing, parallelization & de-scoping levers

- **Hard chain:** P0 → P1 → P2 → P2.1 → P2.2 → P3 → P4 → P5 → P6. Don't reorder — each builds on the last, P1 must be rock-solid before any real data, P2.1 must land before user data begins accumulating, and **P2.2 sets the >95% coverage bar before feature code piles on**.
- **Free-floating after P7:** P8 / P9 order is interchangeable; **P10 (Finance)** depends only on P2 and can be built any time after the shell.
- **If time is tight, ship v0.9 (through P6)** and use it daily; treat P7–P11 as a backlog.
- **De-scope levers:** drop recurrence from Todos; single-currency-only Finance (skip FX table); defer notarization (ad-hoc sign) until the app is a daily driver.
- **Risk buffer:** add ~25% to P1 (Rust ramp) and P3 (native clipboard shim) — the two least-familiar pieces.

---

## Backlog / future (architecture already supports)

- **Calendar module** (RRULE subset; DST/timezone care) — reuses the scheduler.
- **Notes module** (markdown; re-adds CodeMirror + sanitized react-markdown).
- **E2E smoke tests** (`tauri-driver` + WebdriverIO) once the app surface grows — unit tests cover the MVP.
- TOTP/2FA generation · import from other managers · optional encrypted sync · auto-update (opt-in, network).
