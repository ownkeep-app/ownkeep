---
name: release
description: Build, sign, notarize, tag and publish an OwnKeep release to GitHub. Use only when the user explicitly invokes /release or $release.
---

Release OwnKeep. Publishing is public and hard to undo: people download this app to hold their
passwords. Follow every step, in order, and stop on any failure.

## Input

The user's prompt may name a version such as `1.6`. If not, use `package.json`'s `version`. It must
be `main.minor`, and it must equal `package.json`'s version; if it doesn't, stop and ask.

## Authorization

Explicitly invoking this skill authorizes committing, tagging, pushing and publishing **this
version**, as long as the review in step 4 finds nothing unexpected. If anything is unexpected, stop
and ask. Nothing here authorizes a different version, changing the website, or undoing a release.

## Rules

- Run everything from the `ownkeep` repo root. `release.sh`, `publish.sh`, `setup-signing-env.sh` and
  `check-signing.sh` are in the parent folder (`../`), not in this repo. If they're missing, stop and
  say so.
- Never print or read out signing values. `src-tauri/signing/signing-env.sh` is `source`d, never
  displayed. Never open a `.p8` or `.p12` file. Never commit `src-tauri/signing/`.
- Never skip a gate, re-sign by hand, use `--force` or `--no-verify`, or delete or move a tag or
  release to recover from a failure. Report the exact state and ask.
- Don't report a step as done unless its output shows it. Quote what actually happened.

## 1. Preflight

1. Read `RELEASING.md`, the source of truth for the checklist and release note format.
2. `git fetch origin`. Require branch `main`, in sync with `origin/main`. Uncommitted changes are only
   acceptable if they're release-note or docs edits you can identify; otherwise stop and ask.
3. Require that tag `v<version>` doesn't exist locally or on origin, and that no such GitHub release
   exists (`gh release view`). If either does, stop: this version has already shipped.
4. Require `gh auth status` to succeed for an account that can publish to `ownkeep-app/ownkeep`.
5. Check `../ownkeep-web` with `git status`. `publish.sh` stages and pushes that repo too, so any
   uncommitted work there would go out with the release. If it isn't clean, stop and ask.

## 2. Release note

`publish.sh` needs a `## Ready to paste — v<version>` block in `RELEASING.md`, following the template
there. If it's missing, write it now from `git log <previous tag>..HEAD` and `spec.md`:

- Check every claim against the code. Readers trust this page.
- Say plainly what upgraders must know: format or compatibility changes, whether older versions can
  still read their data, and any new storage, permission or content-security-policy behaviour.
- Include real known issues, not just the standing non-goals.
- Leave the literal `# <sha256>` line. `publish.sh` fills it in for the GitHub note. The copy in
  `RELEASING.md` keeps the placeholder, as it has since v1.4.

## 3. Build and verify

The build compiles twice and waits on Apple's notary service, so it can take many minutes. Run it in
the background without a timeout, then wait for it to finish:

```bash
source src-tauri/signing/signing-env.sh && bash ../release.sh <version> > ../release-<version>.log 2>&1
```

If `signing-env.sh` is missing, the user needs to run `../setup-signing-env.sh`, which is interactive.
`../check-signing.sh` diagnoses signing problems with values masked.

If a gate fails, read the failure and fix it only if it's in scope, otherwise report it. A known
exception: `clipboard::tests::appkit` tests have failed intermittently on the pasteboard write. You
may rerun once for that specific failure, and must say that you did.

Require `RESULT=OK` in the log, but don't trust it alone. STAGE 4 prints its checks without failing
on them, and `release.sh` only notarizes the app, not the DMG. Expect the DMG to show `rejected`,
`source=Unnotarized Developer ID` and no ticket at this point. Finish it per `code-signing.md` §7, in
a shell with the signing env sourced, and require `status: Accepted`:

```bash
DMG="$PWD/src-tauri/target/universal-apple-darwin/release/bundle/dmg/OwnKeep_<version>.0_universal.dmg"
xcrun notarytool submit "$DMG" --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" --wait
xcrun stapler staple "$DMG"
spctl -a -vvv -t open --context context:primary-signature "$DMG"
xcrun stapler validate "$DMG"
hdiutil verify "$DMG"
```

Stapling changes the file, so only the SHA-256 computed after this step is valid. `publish.sh`
computes its own, so ignore the one in the build log.

Then confirm each value yourself, using STAGE 4 for the app and the commands above for the DMG:

| Check | Expected |
| --- | --- |
| Architectures | `x86_64 arm64` |
| `LSMinimumSystemVersion` | `13.0` |
| `CFBundleShortVersionString` | `<version>.0` |
| Embedded provisioning profile | present |
| App and DMG authority | `Developer ID Application: Shaojiang Cai (7Y7D9729RJ)` |
| DMG Gatekeeper | `accepted`, `source=Notarized Developer ID` |
| App and DMG stapling | `The validate action worked!` |

Any mismatch: stop. Don't publish.

## 4. Review what would be published

`publish.sh` asks `[y/N]` before it commits. Answering `n` is a dry run: it writes the note and stages
both repos, then exits without committing or pushing.

```bash
printf 'n\n' | bash ../publish.sh <version> "<short summary>"
```

Then check all of the following:

- The staged files in **both** repos are what this release should contain. Anything unexplained, or
  anything under `src-tauri/signing/`, or any key, certificate or `.env` file: stop and ask.
- `../release-note-v<version>.md` has the real SHA-256, no leftover `<sha256>` or `<version>`, and a
  changelog link from the previous tag.

## 5. Publish

```bash
printf 'y\n' | bash ../publish.sh <version> "<short summary>"
```

This commits, tags, pushes, creates the GitHub release with the DMG, then bumps and pushes the next
working version. Require `RESULT=OK`, and also that the log has no `[warn] gh release failed` line:
the script only warns when `gh release create` fails, then still prints `RESULT=OK`.

If it fails partway, some steps may already be public. Report exactly which happened, and ask before
doing anything else.

## 6. Verify what's live

Check the published result, not just the script's output:

1. `gh release view v<version> --repo ownkeep-app/ownkeep`: not a draft, marked latest, DMG attached.
2. Download the DMG into a new empty temp folder with `gh release download`. Its `shasum -a 256` must
   match both the local DMG and the release note.
3. `git ls-remote --tags origin v<version>` shows the tag. `package.json` is at the next version and
   `main` is in sync with `origin/main`.

## 7. Report

State the version, release URL, SHA-256, and any rerun or anomaly. Then list what's left for the user:

- **Clean-Mac smoke test** (`RELEASING.md`): download from the release page, open, confirm Gatekeeper
  doesn't warn, complete first run. An agent can't do this.
- **Website:** check whether `../ownkeep-web/src/lib/site.ts` still points at the previous version.
  If so, ask whether to update it. That repo deploys a public site, so don't change it unasked.
