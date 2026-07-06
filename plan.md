# keystash — Development Plan & Schedule

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
| **0** | Scaffolding, shell, UI kit + tests | Hotkey toggles an empty window; tray alive; shadcn + Lucide wired; `npm test` + `cargo test` green | 2 d | W1 · 2026-07-06 |
| **1** | 🔐 Crypto core (Rust) | Create-vault, unlock (password **and** recovery code), auto-lock, atomic writes — all unit-tested | 3–5 d | W1–W2 · 07-06 |
| **2** | App shell + registry + **Dashboard shell** | `FeatureModule` contract, registry, Dashboard (sidebar + content pane), onboarding (+ Emergency Kit), settings shell | 3–4 d | W3 · 07-20 |
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
| **━━ v1.0 ━━** | **Signed, notarized release** | — | — | **~W10 · 2026-09-07** |

---

## The MVP (Phases 0–6) is the priority

Everything through Phase 6 delivers the two **key features you named** — password vault + command
lines — plus backup/restore and configuration. That's a complete, secure, daily-usable product.
Phases 7–11 are additive modules on an already-stable core; each can slip without blocking use.

**Fastest path to "running on my Mac":** **P0 → P1 → P2 → P3** gives an unlockable password vault
with a **browsable Dashboard** (sidebar + content pane) you can actually use (~2 weeks part-time).
**+P4 → P5** adds the command-bar launcher on top.

---

## Detailed phases

> **Testing is per-phase, not a phase of its own:** every module ships Vitest tests for its pure logic (parsers, ranking, math, reminders) and the Rust core ships `cargo test` / `proptest`; each phase's Exit criteria include green tests. See spec §2.2.

### Phase 0 — Scaffolding, shell, UI kit + test setup · 2 d
- [ ] `create-tauri-app` (React + TS template); Tailwind + Zustand; strict CSP; devtools off in prod.
- [ ] **UI kit:** `shadcn init` (components.json, `@/` path alias, CSS-variable theme tokens, `tailwindcss-animate`); add `lucide-react`; scaffold first components — `button input command`.
- [ ] **Test setup:** Vitest + React Testing Library + `@testing-library/user-event` + jsdom; wire `npm test` and `vitest --coverage`; confirm `cargo test` runs. One trivial passing test on each side.
- [ ] Add plugins: `global-shortcut`, `notification`, `fs`, `dialog`, `single-instance`.
- [ ] Tray icon + `ActivationPolicy::Accessory`; window hides on blur/Esc, shows on hotkey.
- [ ] Global hotkey (`Cmd+Shift+Space`) toggles an empty search window; single-instance re-focuses.
- **Exit:** hotkey summons an empty window from any app; app survives window close (tray); `npm test` **and** `cargo test` run green.
- **Deps:** none.

### Phase 1 — 🔐 Crypto core (Rust) · 3–5 d · *the make-or-break phase*
- [ ] Container format (§4.2): `magic/version/kdf/salts/wrapped_master/wrapped_recovery/vault`.
- [ ] `Argon2id(master)` → `KEK_master`; `HKDF-SHA256(recovery_code)` → `KEK_recovery`.
- [ ] Random `DEK`; XChaCha20-Poly1305 encrypt vault; AEAD-wrap DEK under both KEKs (envelope, §4.1).
- [ ] Tauri commands: `create_vault`, `unlock(password)`, `unlock_recovery(code)`, `lock`, `change_master`, `regenerate_recovery`.
- [ ] Recovery-code generation (12-word list) + **Emergency Kit** payload.
- [ ] In-Rust decrypted model; **auto-lock timer** + `zeroize` on lock/quit; optional failed-attempt backoff.
- [ ] **Atomic writes** (temp → `fsync` → rename).
- [ ] **Unit tests (`cargo test` + `proptest`):** wrong-password rejects; both unlock paths recover the same DEK; tamper → AEAD fail; round-trip encrypt/decrypt; re-wrap after `change_master`; property-test random keys/inputs.
- **Exit:** create a vault, lock, reopen with password AND with recovery code; corrupting a byte fails cleanly.
- **Deps:** P0. **Do not build features until this is solid and tested.**

### Phase 2 — App shell + module registry + Dashboard shell · 3–4 d
- [ ] `FeatureModule` interface (incl. `ListView`) + `MODULES` registry (§3.4); Zustand store for the decrypted projection.
- [ ] Unified-index plumbing (empty until modules land) with Fuse.js + a frecency booster stub.
- [ ] **Dashboard shell (§7.5):** left sidebar (one row per enabled module, from the registry) + right content pane rendering the selected module's `ListView`; `Cmd+Shift+D` toggles the window; sidebar nav (`↑/↓`, `Cmd+1..9`).
- [ ] Lock screen + **onboarding**: set master password → **show Emergency Kit** → set hotkey.
- [ ] Settings shell with a **Modules** tab (enable toggles) rendered from the registry.
- **Exit:** first-run onboarding completes; lock/unlock cycles; the Dashboard sidebar lists enabled modules and switches panes (empty `ListView`s OK until modules land).
- **Deps:** P1.

### Phase 3 — 🔑 Passwords module (F1) · 2–3 d · *proves the security model*
- [ ] `passwordsModule`: `secretFields: ["password"]`, `buildIndex`, `ListView` (masked dashboard list), `DetailView`, `EditView`.
- [ ] Rust **`copy_secret(id, field)`** → **concealed pasteboard** (custom objc2/cocoa shim) + auto-clear timer; reveal-on-demand.
- [ ] CRUD; masked display; click-to-open login/recovery URLs.
- **Exit:** create/edit/delete entries; the passwords `ListView` renders in the Dashboard with masked values; copy a password with it **never appearing in the DOM** (verify in devtools); pasteboard clears after N s and is ignored by a clipboard-history tool.
- **Deps:** P2. Front-loaded to validate §4.5 end-to-end early.

### Phase 4 — ⌨️ Command bar (F10 / §7) · 2–3 d
- [ ] Bar shell = shadcn **`command`** (`cmdk`) with `shouldFilter={false}`; unified index across enabled modules; **fuzzy (Fuse.js) × frecency** ranking; update `frecency` on use.
- [ ] Scope prefixes (`p `, `c `, …); result list capped at `resultLimit`, numbered 1–9.
- [ ] Keyboard nav (`↑/↓`, `Enter` open, `Cmd+<n>` primary action); Esc/blur hides.
- [ ] **Tests:** ranking (fuzzy×frecency ordering) + scope-prefix parsing (Vitest).
- **Exit:** typing filters passwords instantly; `Cmd+1..9` runs the primary action; frecency reorders repeats.
- **Deps:** P3.

### Phase 5 — 📋 Commands module (F2) · 2–3 d
- [ ] `commandsModule`: category/title/description/snippets; Shiki highlighting; `ListView` (grouped by category).
- [ ] `{{name}}` parser; typed `arguments` (text/enum); **interactive fill-in form** (Tab/Shift-Tab, Enter=copy completed).
- [ ] Raw-copy secondary action (`Opt+Cmd+<n>` / `Opt+Enter`).
- [ ] **Tests:** `{{ }}` parse (names, reuse, invalid) + fill substitution + raw-vs-filled output (Vitest).
- **Exit:** a mid-string placeholder (`docker run -p {{port}}:{{port}} {{img}}`) fills correctly; raw copy preserves `{{ }}`; snippets highlight.
- **Deps:** P4.

### Phase 6 — 💾 Backup/restore (§11) + Settings UI (§9) · 2–3 d
- [ ] Backup: file dialog → copy encrypted container (timestamped name).
- [ ] Restore: pick file → decrypt-verify → warn → optional `pre-restore` snapshot → atomic replace → reload.
- [ ] Settings UI: hotkeys, auto-lock, clipboard clear, theme/accent, result limit, per-module toggles; Emergency Kit regen.
- **Exit:** backup→restore round-trips on a fresh machine; restore refuses a wrong password; settings persist (encrypted).
- **Deps:** P5. **← MVP / v0.9 ends here.**

### Phase 7 — 🔔 Scheduler infra (§8) · 1–2 d
- [ ] Tray-alive interval task + wake-from-sleep; calls each enabled module's `collectReminders`.
- [ ] De-dupe (last-notified per item); request notification permission; native notify.
- [ ] **Tests:** last-notified windowing / de-dupe logic (Vitest, or `cargo test` if the scheduler lives in Rust).
- **Exit:** a dummy reminder fires once; app notifies while the window is hidden.
- **Deps:** P6.

### Phase 8 — ✅ Todos module (M1) · 1–2 d
- [ ] `todosModule`: title/notes/done/dueAt/priority/tags; `none|daily|weekly` recurrence; `collectReminders`; `ListView` (checklist).
- [ ] Bar actions: toggle done; recurring rolls forward on completion.
- [ ] **Tests:** recurrence rollover (daily/weekly) + `collectReminders` windowing/de-dupe (Vitest).
- **Exit:** overdue todo notifies once per window; completing a weekly todo reschedules.
- **Deps:** P7.

### Phase 9 — 🔁 Subscriptions module (M2) · 1–2 d
- [ ] `subscriptionsModule`: service/url/amount/currency/cycle/nextDueDate/autoRenew/lead/notes; `collectReminders`; `ListView` (table + monthly/annual summary header).
- [ ] Editing cycle/due reschedules; monthly total + annualized summary view.
- [ ] **Tests:** next-due recompute per cycle (weekly/monthly/yearly/custom) + annualized summary math (Vitest).
- **Exit:** lead-window reminder fires; summary totals correctly (via finance FX if enabled).
- **Deps:** P7 (independent of P8 — can swap order).

### Phase 10 — 📈 Finance module (M3) · 2–3 d
- [ ] `financeModule`: snapshots of `{place,category,amount,currency}`; recompute total + by-category on save.
- [ ] Manual **FX rate table**; convert to `baseCurrency`; **uPlot** net-worth trend.
- [ ] `ListView` (dashboard): the uPlot trend atop the right pane + the snapshot table below.
- [ ] **Tests:** total + by-category + FX conversion; re-total after a rate edit (Vitest).
- **Exit:** adding a snapshot updates totals + curve; editing a rate re-totals all snapshots.
- **Deps:** P2 (data), independent of P7–P9.

### Phase 11 — ✨ Polish + ship · 2–4 d
- [ ] Theming pass (light/dark/accent), empty states, error toasts, keyboard-map help.
- [ ] Accessibility check; performance check (<300 ms to bar, <30 ms keystroke).
- [ ] **Developer ID sign + notarize**; DMG/`.app` packaging; README + Emergency-Kit docs.
- **Exit:** Gatekeeper opens it clean on a second Mac; permissions prompt correctly. **← v1.0.**
- **Deps:** all prior.

---

## Definition of Done — v1.0

- Unlock via master password **and** recovery code; auto-lock + zeroize verified.
- Secrets never enter the WebView; concealed clipboard confirmed against a history tool.
- Command bar: fuzzy+frecency, scope prefixes, numbered copy, interactive fill-in.
- Dashboard: sidebar lists enabled modules; each renders its full content (`ListView`) in the right pane; secrets stay masked.
- Backup/restore is atomic and decryption-gated.
- Every enabled module toggles cleanly from Settings with data preserved.
- Tests green: **Vitest** (frontend logic) + **`cargo test` / `proptest`** (crypto); each module's pure logic covered.
- Signed + notarized; opens on a clean Mac without warnings.

---

## Sequencing, parallelization & de-scoping levers

- **Hard chain:** P0 → P1 → P2 → P3 → P4 → P5 → P6. Don't reorder — each builds on the last, and P1 must be rock-solid before any real data.
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
