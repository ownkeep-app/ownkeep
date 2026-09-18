# Releasing OwnKeep

People download OwnKeep to hold their passwords. They read the release page more carefully than they
read almost anything else, and they have no way to check the binary except what we give them. A
release note that says only "Features delivered: …" fails that reader.

Full signing and notarization mechanics live in [`code-signing.md`](code-signing.md). This page is
the release checklist and the note format.

## Checklist

**Before building**

- [ ] `pnpm check` green
- [ ] `pnpm coverage:all` green (>95% both surfaces)
- [ ] `cd src-tauri && cargo test` green
- [ ] `package.json` version is the version being shipped; `node scripts/sync-version.mjs` has run
- [ ] Migration guide covers every data-shape change since the previous `v*` tag
- [ ] `spec.md` / `plan.md` reflect what actually shipped

**Build**

- [ ] Both targets installed: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`
- [ ] Signing and notarization credentials exported (see [`code-signing.md`](code-signing.md) §4)
- [ ] Build Universal 2 explicitly — a bare `pnpm build` is host-arch only and cannot pass the next
      check:

      ```bash
      pnpm tauri build --target universal-apple-darwin --bundles app,dmg --verbose
      ```

      Artifacts land under `src-tauri/target/universal-apple-darwin/release/bundle/`, not
      `target/release/bundle/`.

- [ ] Universal 2, not single-arch: `lipo -archs "…/OwnKeep.app/Contents/MacOS/OwnKeep"` → `x86_64 arm64`
- [ ] `LSMinimumSystemVersion` is `13.0`, matching the documented floor: `/usr/libexec/PlistBuddy -c "Print :LSMinimumSystemVersion" "…/OwnKeep.app/Contents/Info.plist"`

**Verify before uploading** — never ship an artifact you haven't run these against:

```bash
DMG=src-tauri/target/universal-apple-darwin/release/bundle/dmg/OwnKeep_<version>_universal.dmg

codesign -dvvv "$DMG" 2>&1 | grep -E 'Authority|TeamIdentifier'
spctl -a -vvv -t open --context context:primary-signature "$DMG"
xcrun stapler validate "$DMG"
shasum -a 256 "$DMG"
```

- [ ] Authority is `Developer ID Application: Shaojiang Cai (7Y7D9729RJ)`
- [ ] `spctl` → `accepted`, `source=Notarized Developer ID`
- [ ] `stapler validate` → "The validate action worked!"
- [ ] The `.app` inside carries `Contents/embedded.provisionprofile` (required for Touch ID)
- [ ] Record the SHA-256 for the release note

> ⚠️ The stale bundle in `src-tauri/target/release/` from an earlier `pnpm build` may be ad-hoc
> signed and unnotarized. Always verify the exact file you are about to upload — an ad-hoc build
> reports `TeamIdentifier=not set` and `spctl` rejects it.

**Publish**

- [ ] Tag `v<main>.<minor>`, upload the Universal DMG, paste the release note below
- [ ] Immediately bump `package.json` to the next working version and run `node scripts/sync-version.mjs`
- [ ] Smoke-test on a clean Mac: download from the release page, open, verify Gatekeeper does not warn, complete first run

## Release note template

```markdown
## OwnKeep <version>

<One or two sentences: what changed and who should care.>

### Requirements
- macOS 13 or later
- Universal 2 — Apple Silicon and Intel

### Install
Download the `.dmg`, open it, drag OwnKeep to Applications. On first launch macOS asks for
**Accessibility** permission so the `⌘⇧Space` global hotkey works system-wide; OwnKeep runs in the
menu bar with no Dock icon.

Upgrading from an earlier version? Drag the new app over the old one. Your vault lives outside the
app bundle and is untouched. If the data shape changed, OwnKeep shows a migration guide and writes a
pre-migration backup before anything else happens.

### Verify this download
Signed with a Developer ID certificate, built with hardened runtime, notarized and stapled by Apple.
Check it yourself rather than taking my word for it:

    spctl -a -vvv -t open --context context:primary-signature OwnKeep_<version>_universal.dmg
    # expect: accepted / source=Notarized Developer ID

    shasum -a 256 OwnKeep_<version>_universal.dmg
    # expect: <sha256>

### Changes
- …

### Known issues
- …

**Full changelog:** https://github.com/ownkeep-app/ownkeep/compare/v<prev>...v<version>
```

## Ready to paste — v1.4

Fill in `<sha256>` from the verification step above against the exact DMG you upload.

```markdown
## OwnKeep v1.4

A refreshed app icon and tray icon — same vault, same hotkey, new face.

### Requirements
- macOS 13 or later
- Universal 2 — Apple Silicon and Intel

### Install
Download the `.dmg`, open it, drag OwnKeep to Applications. On first launch macOS asks for
**Accessibility** permission so the `⌘⇧Space` global hotkey works system-wide; OwnKeep runs in the
menu bar with no Dock icon.

Upgrading from v1.3? Drag the new app over the old one. Your vault lives outside the app bundle and
is untouched. No schema change, no migration, no Emergency Kit re-issue.

### Verify this download
Signed with a Developer ID certificate, built with hardened runtime, notarized and stapled by Apple.
Check it yourself rather than taking my word for it:

    spctl -a -vvv -t open --context context:primary-signature OwnKeep_1.4.0_universal.dmg
    # expect: accepted / source=Notarized Developer ID

    shasum -a 256 OwnKeep_1.4.0_universal.dmg
    # <sha256>

### Changes
- **New app icon** across the Dock, Finder, About dialog, and the release DMG.
- **Updated menu-bar tray icon** for light and dark appearance.
- README hero now shows a silent hotkey recording (AVIF with GIF fallback) instead of a still.

### Known issues
- No sync, no browser autofill, no TOTP generation — all deliberate non-goals.
- macOS only.
- OwnKeep has not had a third-party security audit. See [SECURITY.md](https://github.com/ownkeep-app/ownkeep/blob/main/SECURITY.md).

**Full changelog:** https://github.com/ownkeep-app/ownkeep/compare/v1.3...v1.4
```

## Previously shipped — v1.3

```markdown
## OwnKeep v1.3

A notes module with a Markdown editor, and auto-renewing subscriptions that roll themselves forward.

### Requirements
- macOS 13 or later
- Universal 2 — Apple Silicon and Intel

### Install
Download the `.dmg`, open it, drag OwnKeep to Applications. On first launch macOS asks for
**Accessibility** permission so the `⌘⇧Space` global hotkey works system-wide; OwnKeep runs in the
menu bar with no Dock icon.

Upgrading from v1.2? Drag the new app over the old one. Your vault lives outside the app bundle and
is untouched. The vault schema is unchanged at version 11 — v1.3 adds an empty `notes` slice the
first time it opens your vault, and nothing else about the file changes. No migration runs and no
re-issue of the Emergency Kit is needed.

**One thing will surprise your fingers:** Notes takes `⌥⇧4`, so Subscriptions moves to `⌥⇧5` and
Finance to `⌥⇧6`. Modules are numbered by their position in the sidebar, so inserting one shifts
everything below it.

### Verify this download
Signed with a Developer ID certificate, built with hardened runtime, notarized and stapled by Apple.
Check it yourself rather than taking my word for it:

    spctl -a -vvv -t open --context context:primary-signature OwnKeep_1.3.0_universal.dmg
    # expect: accepted / source=Notarized Developer ID

    shasum -a 256 OwnKeep_1.3.0_universal.dmg

### Changes
- **Notes module (`⌥⇧4`).** Markdown notes with a formatting toolbar, a Write/Preview toggle, and a full-screen editing mode. Notes group by category and sort by last edited. Code blocks get the same per-line copy affordance as the Commands module. Rendered Markdown is sanitised before display, so a note pasted in from elsewhere cannot inject markup.
- Notes are **not** in the command bar by default — they are long-form text and would drown out logins and commands. Turn on searchability per module in Settings, or scope a command-bar query to notes with the `n` prefix.
- Subscriptions and Finance move to `⌥⇧5` and `⌥⇧6` to make room for Notes at `⌥⇧4`.
- **Auto-renew subscriptions now roll forward on their own.** When the invoice day arrives, OwnKeep advances the subscription to its next invoice date and notifies you once that it renewed. This is the first feature that writes to your vault without you asking: it happens only while the vault is unlocked, only to the `nextDueDate` of subscriptions you marked auto-renew, and the Dashboard refreshes itself when it does. Manual subscriptions are untouched and still go overdue if you ignore them.
- Reminders are now deduplicated per due occurrence instead of on a five-minute cooldown, so rescheduling an item lets it notify again and nothing fires twice for the same due date.
- Settings keeps its header in place and scrolls the body; theme is a button group rather than a dropdown.

### Known issues
- Notes have no revision history — an edit replaces the previous body. Your backups are the undo.
- The command bar indexes a note's full body when searchability is enabled, so a large note makes for noisy results.
- Your vault is one encrypted file that is rewritten in full on every save, so notes are best kept to notes. A few hundred of them is nothing; pasting entire documents in will make every save in every module slower.
- No sync, no browser autofill, no TOTP generation — all deliberate non-goals.
- macOS only.

**Full changelog:** https://github.com/ownkeep-app/ownkeep/compare/v1.2...v1.3
```

## Previously shipped — v1.2

Kept for reference. Every value below was verified against the published artifact on 2026-08-22;
the tag `v1.2` points at the Touch ID merge and is not re-cut.

```markdown
## OwnKeep v1.2

Touch ID unlock, a signed and notarized build, and the OwnKeep identity across the app.

### Requirements
- macOS 13 or later
- Universal 2 — Apple Silicon and Intel

### Install
Download the `.dmg`, open it, drag OwnKeep to Applications. On first launch macOS asks for
**Accessibility** permission so the `⌘⇧Space` global hotkey works system-wide; OwnKeep runs in the
menu bar with no Dock icon.

Upgrading? Drag the new app over the old one — your vault lives outside the app bundle and is
untouched. v1.2 writes a forward-incompatible container (v3), so older builds will refuse the file
afterwards; the migration guide runs first and writes a pre-migration backup.

After upgrading, regenerate the Emergency Kit once from Settings to move its recovery wrap to the
current derivation context. Your existing recovery code keeps working until you do.

### Verify this download
Signed with a Developer ID certificate, built with hardened runtime, notarized and stapled by Apple.

    spctl -a -vvv -t open --context context:primary-signature OwnKeep_1.2.0_universal.dmg
    # expect: accepted / source=Notarized Developer ID

    shasum -a 256 OwnKeep_1.2.0_universal.dmg
    # c9155adb8dda341c16852b1efaa56cf549c86ebc69519f877d23b214307f7a2c

### Changes
- **Touch ID unlock (opt-in, off by default).** Enroll from Settings → System → Security while the vault is unlocked. It's a third envelope wrap, never a replacement: the master password and recovery code always unlock, so losing or disabling Touch ID can't lock you out. The biometric key is device-local, excluded from backups, and invalidated if your enrolled fingerprints change.
- **Signed and notarized releases.** Gatekeeper opens OwnKeep cleanly on a new Mac with no warning.
- **OwnKeep identity** across the app, vault location, backup filenames, and docs.
- Dashboard list improvements: sorting, column resize, detail modals, password quick actions.
- Notes fields are multi-line; subscriptions show the next invoice date.

### Known issues
- No sync, no browser autofill, no TOTP generation — all deliberate non-goals.
- macOS only.
```
