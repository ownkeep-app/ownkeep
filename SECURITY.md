# Security Policy

OwnKeep holds passwords. This document states exactly what it does, what it does **not** do, and how
to report a problem — so you can decide whether to trust it rather than take a claim on faith.

## Reporting a vulnerability

**Please do not open a public issue for a security bug.**

Use GitHub's private vulnerability reporting: [Security → Report a
vulnerability](https://github.com/ownkeep-app/ownkeep/security/advisories/new). It is private between
you and the maintainer.

<!-- TODO(maintainer): add a security contact address here, or delete this line if GitHub private
     reporting is the only channel you want. -->

OwnKeep is maintained by one person, part-time. Realistic expectations:

| | |
|---|---|
| First response | within 5 days |
| Assessment | within 14 days |
| Fix for a confirmed critical issue | as fast as I can, then a release |
| Credit | yes, in the release notes, unless you'd rather not be named |

There is no bug bounty.

## Supported versions

Only the latest release receives fixes. OwnKeep upgrades by manual `.dmg` replacement; there is no
auto-update, so please check the [releases page](https://github.com/ownkeep-app/ownkeep/releases).

| Version | Supported |
|---|---|
| 1.2.x | ✅ |
| < 1.2 | ❌ |

## What OwnKeep actually does

The whole vault is a single AEAD-encrypted file at
`~/Library/Application Support/com.shaojiang.ownkeep/vault.dat`. There is no database, no server,
and no network traffic at runtime.

**Envelope encryption.** One random 256-bit data encryption key (DEK) encrypts the vault. The DEK is
never stored in the clear — it is wrapped separately by up to three key-encryption keys, so any one
credential can unlock the vault without the others being derivable from it.

| Path | Key derivation | Authoritative |
|---|---|---|
| A · Master password | Argon2id → `KEK_master` | ✅ always available |
| B · Recovery code | HKDF-SHA256 → `KEK_recovery` | ✅ always available |
| C · Touch ID | random `KEK_biometric` held in the macOS data-protection Keychain | ❌ optional shortcut |

**Primitives and parameters**, as implemented in `src-tauri/src/crypto.rs`:

- **KDF (master password):** Argon2id, m = 262144 KiB (256 MiB), t = 3, p = 4, 32-byte output, 16-byte random salt.
- **KDF (recovery code):** HKDF-SHA256, info `ownkeep recovery kek v1`, 32-byte output, separate 16-byte salt.
- **AEAD:** XChaCha20-Poly1305, 24-byte random nonce per sealed blob, fresh nonce on every write.
- **Key hygiene:** all key material is `Zeroizing`; keys are zeroed on lock.
- **Crates:** `argon2` 0.5, `chacha20poly1305` 0.10, `hkdf` 0.12, `sha2` 0.10, `zeroize` 1.x, `getrandom` 0.2 — no hand-rolled cryptography.
- **Container:** self-describing and versioned (`OWNK`, v3), so KDF parameters travel with the file and can be raised later without breaking existing vaults.

**Process boundary.** Secret values live in the Rust core and are never sent to the WebView. Copying
a password writes it to the pasteboard from Rust with `org.nspasteboard.ConcealedType` set, so
clipboard-history tools skip it, and the clipboard auto-clears.

**Touch ID.** Opt-in and off by default. It is a *third wrap*, never a replacement: enrolling
requires an already-unlocked vault, and the master password and recovery code always work. The
biometric key sits behind `SecAccessControl(BiometryCurrentSet, WhenUnlockedThisDeviceOnly)`,
non-synchronizable, in the data-protection Keychain — so changing your enrolled fingerprints
invalidates it. It is **device-local and excluded from every backup**: a restored vault has Touch ID
off and must be re-enrolled.

**Distribution.** Releases are signed with a Developer ID certificate, built with hardened runtime,
and notarized and stapled by Apple. Verify any download yourself before opening it:

```bash
spctl -a -vvv -t open --context context:primary-signature OwnKeep_1.2.0_universal.dmg
```

Expect `accepted` and `source=Notarized Developer ID`.

## What OwnKeep does not do

Stated plainly, because these are the things that should inform your decision:

- **No third-party security audit.** The cryptography has not been reviewed by an outside firm. The construction uses standard primitives with conventional parameters, the crypto core is property-tested, and unit-test line coverage is enforced above 95% on both the Rust and TypeScript surfaces — but that is not an audit, and I will not describe it as one.
- **No formal verification**, and no side-channel hardening beyond what the underlying crates provide.
- **No memory-safety guarantee for the whole process.** The Rust core is safe Rust, but macOS may page memory to disk and OwnKeep does not lock pages.
- **No protection against a compromised Mac.** A keylogger, a screen recorder, or malware running as your user can capture the master password as you type it. Full-disk encryption and an uncompromised machine are assumed.
- **No sync, no browser integration, no autofill, no TOTP/2FA generation, no import from other managers.** These are deliberate non-goals, not a roadmap.
- **macOS only** (13+, Universal 2). Touch ID, the concealed clipboard, and the menu-bar behavior are macOS-native.
- **One maintainer.** Judge the project accordingly.

## Your responsibilities

- **The master password is never stored and cannot be recovered.** If you forget it, the recovery code is the only other way in.
- **Store the Emergency Kit offline and away from the vault file** — printed, or in a different password manager. Anyone holding it can unlock the vault.
- **Keep your own backups.** Use Settings → Backup; a backup is decryption-gated and restorable, and backups deliberately exclude Touch ID enrollment.

## How to verify these claims yourself

You do not have to trust this document:

- Read `src-tauri/src/crypto.rs`, `envelope.rs`, and `container.rs` — the entire cryptographic surface is a few hundred lines.
- Run the property tests: `cd src-tauri && cargo test`.
- Check the coverage gates: `pnpm coverage:all`.
- Confirm the app makes no network connections (Little Snitch, LuLu, or `lsof -i -P | grep OwnKeep`).
- Confirm the vault file is opaque: `head -c 64 ~/Library/Application\ Support/com.shaojiang.ownkeep/vault.dat`.
