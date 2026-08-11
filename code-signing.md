# OwnKeep macOS Touch ID, Code Signing, and Notarization

This guide covers two related but separate requirements:

| Goal                                              | Required                                                                                                                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Make OwnKeep's native Touch ID Keychain item work | Code that explicitly targets the data-protection Keychain, plus a signed `.app` with its private application-identifier entitlement and a matching embedded provisioning profile |
| Distribute OwnKeep outside the Mac App Store      | Developer ID signing, hardened runtime, Apple notarization, and stapling                                                                                                         |

Notarization does not grant Keychain access, and hardened runtime does not replace Keychain
entitlements. Conversely, a locally signed and provisioned development app can test Touch ID without
being notarized.

## Why Touch ID needs a signed and provisioned app

OwnKeep protects its device-local biometric wrapping key with `SecAccessControl` and
`biometryCurrentSet`. On macOS, this uses the data protection Keychain. Its access groups come from
the app's code-signing entitlements. OwnKeep does not pass `kSecAttrAccessGroup`, so Keychain
Services uses the app identifier (`com.apple.application-identifier`) as the private default access
group. That restricted entitlement must be authorized by a provisioning profile.

This is a security boundary. A Keychain service or account name is only an item label; it must not
allow an unrelated program to impersonate OwnKeep and retrieve the biometric wrapping key. The
signed Team ID, bundle identifier, access group, and profile establish which app is allowed to use
that item. See Apple's [Mac Keychain technical note](https://developer.apple.com/documentation/Technotes/tn3137-on-mac-keychains)
and [provisioning-profile technical note](https://developer.apple.com/documentation/Technotes/tn3125-inside-code-signing-provisioning-profiles).

There is no separate generic "Touch ID entitlement" to add, and OwnKeep does not share its
biometric item with another app. The Apple Developer portal's **Keychain Sharing** capability and a
`keychain-access-groups` entitlement are therefore not required. Apple's
[Keychain access-group documentation](https://developer.apple.com/documentation/security/sharing-access-to-keychain-items-among-a-collection-of-apps)
states that when no Keychain access groups are specified, the app identifier is the default group.

### Confirmed current behavior

An audit of OwnKeep's native biometric code on a Touch ID-capable Mac produced:

```text
available=true has_key=false
biometric unlock failed: A required entitlement isn't present.
```

The underlying macOS error is `errSecMissingEntitlement` (`-34018`). This means sensor detection can
work in an unsigned development process, but creating the biometric-protected Keychain item cannot.
An ordinary `pnpm tauri dev` process has no app bundle in which to embed the authorizing profile, so
native Touch ID enrollment is not expected to work there.

### Implementation prerequisite found by this audit — resolved in code

Signing was necessary but was not the only remaining prerequisite. Apple says macOS `SecItem`
operations default to the legacy file-based Keychain, while biometric protection requires the
data-protection Keychain. Every add, search, read, and delete query for OwnKeep's biometric item
must therefore set `kSecUseDataProtectionKeychain` to `true`. At the time of the audit,
`src-tauri/src/biometric.rs` did not set that key.

That code fix has landed, so **signing is now the only remaining prerequisite**. All four operation
paths target the data-protection Keychain:

- `src-tauri/Cargo.toml` enables the `security-framework` crate's `OSX_10_15` feature, which is what
  exposes `kSecUseDataProtectionKeychain` at all.
- A shared `protected_item_query()` helper builds the store, load, and delete query and calls
  `PasswordOptions::use_protected_keychain()`, so those three paths cannot drift apart.
- The delete path calls `delete_generic_password_options`, not `delete_generic_password`. The latter
  builds its own query internally and cannot be pointed away from the legacy Keychain.
- The attributes-only existence search calls `ItemSearchOptions::ignore_legacy_keychains()`, the
  crate's spelling of the same key.

`kSecAttrSynchronizable` is deliberately not set; that opts into iCloud synchronization and would
conflict with OwnKeep's device-local design. Apple's
[data-protection Keychain reference](https://developer.apple.com/documentation/security/ksecusedataprotectionkeychain)
recommends setting `kSecUseDataProtectionKeychain` on add, search, and delete operations.

Two traps are worth knowing before revisiting this code:

- `ItemSearchOptions::ignore_legacy_keychains()` still compiles with the `OSX_10_15` feature off and
  then silently does nothing, quietly sending the existence probe to the legacy Keychain. The
  feature is instead held on by `use_protected_keychain()`, which does **not** exist without it, so
  dropping the feature fails the build rather than degrading at runtime.
- `protected_query_targets_data_protection_keychain_and_nothing_else` in `biometric.rs` pins the
  exact set of query keys, so removing the data-protection opt-in or adding iCloud sync fails
  `cargo test` instead of surfacing only on signed hardware. The existence search cannot be asserted
  the same way — `ItemSearchOptions` keeps its query private — so that one path still relies on the
  on-device check in section 9.

Because the data-protection Keychain is itself entitlement-gated, an unsigned build now fails at
enrollment more consistently than before. `errSecMissingEntitlement` (`-34018`) from a `tauri dev`
process is the expected result, not a regression.

## 1. Create the Apple signing assets

OwnKeep's bundle identifier is `com.shaojiang.ownkeep`. Use a paid Apple Developer Program team and
keep the App ID prefix, Team ID, bundle identifier, and private Keychain access-group value stable
across releases. The App ID prefix is often the Team ID for newer accounts, but Apple does not
guarantee that they are identical.

In Apple Developer **Certificates, Identifiers & Profiles**:

### 1.1 Register the identifier

1. Open **Identifiers**, click **+**, and choose **App IDs → App**.
2. Enter a description such as `OwnKeep`.
3. Select an **Explicit** Bundle ID and enter `com.shaojiang.ownkeep`.
4. Leave the **Capabilities**, **App Services**, and **Capability Requests** tabs unchanged. It is
   correct that searching them does not show Keychain Sharing for this registration flow; OwnKeep
   uses its app identifier as a private Keychain group and does not enable cross-app sharing.
5. Click **Continue**, review the values, and click **Register**.

### 1.2 Create the Developer ID Application certificate

From the newly registered identifier list:

1. Click **Certificates** in the left sidebar, then click **+**.
2. Under **Software**, choose **Developer ID**, then choose **Developer ID Application** — not
   Developer ID Installer — and click **Continue**.
3. When the portal requests a certificate signing request (CSR), open **Keychain Access** and choose
   **Certificate Assistant → Request a Certificate From a Certificate Authority**.
4. Enter the Apple Account email address, enter a recognizable common name such as
   `OwnKeep Developer ID`, leave the CA email address empty, choose **Saved to disk**, and save the
   `.certSigningRequest` file.
5. Return to the portal, upload that CSR, click **Continue**, and download the generated `.cer`.
6. Open the `.cer` file to install it. In Keychain Access → **My Certificates**, expand the
   **Developer ID Application** certificate and confirm that its private key appears underneath it.

Apple's current [Developer ID certificate instructions](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/)
describe the same CSR, download, and installation flow.

### 1.3 Create the Developer ID provisioning profile

After the Developer ID Application certificate is installed:

1. Click **Profiles** in the portal's left sidebar, then click **+**.
2. Under **Distribution**, choose **Developer ID** and click **Continue**.
3. Select the explicit OwnKeep App ID (`com.shaojiang.ownkeep`) and click **Continue**.
4. Select the Developer ID Application certificate created above and click **Continue**.
5. Name the profile `OwnKeep Developer ID`, click **Generate**, then click **Download**.
6. Keep the downloaded file as `OwnKeep_Developer_ID.provisionprofile` for section 3.

Do not go back and add a Keychain Sharing capability before generating this profile. The profile
binds the Team ID, App ID prefix, explicit Bundle ID, and Developer ID certificate; section 3
verifies its entitlement allowlist before it is used.

Verify the installed identity:

```bash
security find-identity -v -p codesigning
```

The output should include a value resembling:

```text
Developer ID Application: Your Name (TEAMID)
```

Apple documents why restricted entitlements require a profile and why a macOS profile belongs at
`OwnKeep.app/Contents/embedded.provisionprofile` in
[TN3125](https://developer.apple.com/documentation/Technotes/tn3125-inside-code-signing-provisioning-profiles).

## 2. Add OwnKeep's signing entitlements

Create `src-tauri/OwnKeep.entitlements` with the following content. Replace `APP_ID_PREFIX` with the
literal App ID prefix for the registered OwnKeep identifier, and replace `TEAM_ID` with the literal
Team ID. Read both values from the Developer portal or the decoded profile; do not assume they are
equal. `codesign` does not expand Xcode build variables such as `$(AppIdentifierPrefix)` in a
hand-written plist.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.application-identifier</key>
  <string>APP_ID_PREFIX.com.shaojiang.ownkeep</string>
  <key>com.apple.developer.team-identifier</key>
  <string>TEAM_ID</string>
</dict>
</plist>
```

`APP_ID_PREFIX.com.shaojiang.ownkeep` is OwnKeep's private Keychain access group because the native
code does not specify `kSecAttrAccessGroup`. Do not add `keychain-access-groups` unless OwnKeep later
needs to share Keychain items with a second app. Adding such an entitlement changes the ordered
access-group list and can change the default group, so that would require an intentional migration
design for already-enrolled biometric items.

Apple's [distribution-signing guide](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac)
explains manual distribution signing. Apple's
[Keychain access-group documentation](https://developer.apple.com/documentation/security/sharing-access-to-keychain-items-among-a-collection-of-apps)
explains that the application identifier is the default when no Keychain Sharing groups are
declared.

## 3. Embed the matching provisioning profile with Tauri

Place the downloaded profile at:

```text
src-tauri/signing/OwnKeep_Developer_ID.provisionprofile
```

Keep signing private keys, exported `.p12` files, notarization keys, and passwords out of the
repository. A provisioning profile does not contain the signing private key, but keeping locally
downloaded profiles out of source control helps prevent stale profiles from being used. Add
`src-tauri/signing/` to the repository's ignore policy if profiles are managed locally or by CI.

Merge these keys into the existing `bundle.macOS` object in `src-tauri/tauri.conf.json`:

```json
{
  "bundle": {
    "macOS": {
      "infoPlist": "Info.plist",
      "hardenedRuntime": true,
      "entitlements": "./OwnKeep.entitlements",
      "files": {
        "embedded.provisionprofile": "./signing/OwnKeep_Developer_ID.provisionprofile"
      }
    }
  }
}
```

The `files` mapping puts the profile at `OwnKeep.app/Contents/embedded.provisionprofile` before Tauri
signs the app. Tauri's [application-bundle guide](https://v2.tauri.app/distribute/macos-application-bundle/)
documents both the entitlements path and this profile-embedding mapping.

Verify that `tauri.conf.json` contains both `entitlements` and the profile `files` mapping before
building. This configuration is a prerequisite; Developer ID signing alone will not fix Touch ID.

### Inspect the downloaded profile before building

```bash
PROFILE="$PWD/src-tauri/signing/OwnKeep_Developer_ID.provisionprofile"

security cms -D -i "$PROFILE" > /tmp/ownkeep-profile.plist
/usr/libexec/PlistBuddy -c 'Print :Name' /tmp/ownkeep-profile.plist
/usr/libexec/PlistBuddy -c 'Print :ExpirationDate' /tmp/ownkeep-profile.plist
/usr/libexec/PlistBuddy -c 'Print :ApplicationIdentifierPrefix:0' /tmp/ownkeep-profile.plist
/usr/libexec/PlistBuddy -c 'Print :TeamIdentifier:0' /tmp/ownkeep-profile.plist
/usr/libexec/PlistBuddy -c 'Print :Entitlements' /tmp/ownkeep-profile.plist
```

Confirm that the profile:

- has not expired;
- belongs to the intended Team ID;
- has `ApplicationIdentifierPrefix` set to the expected App ID prefix;
- authorizes `APP_ID_PREFIX.com.shaojiang.ownkeep` through its application-identifier entitlement;
  and
- includes an entitlement allowlist compatible with the app's exact claims in section 2. A profile
  may contain a broader `keychain-access-groups` wildcard such as `APP_ID_PREFIX.*`; that is an
  authorization allowlist in the profile, not a requirement to claim that entitlement in the app
  signature.

Do not continue with a profile whose App ID prefix, Team ID, Bundle ID, certificate, or entitlement
allowlist does not match the app.

## 4. Configure release signing and notarization

Export the exact Developer ID identity shown by Keychain:

```bash
export APPLE_SIGNING_IDENTITY='Developer ID Application: Your Name (TEAMID)'
```

Do not hardcode the identity in `tauri.conf.json`; the environment variable keeps local and CI
identities flexible. See [Tauri's macOS signing guide](https://v2.tauri.app/distribute/sign/macos/).

Configure one of the following notarization methods. Notarization is required for public
distribution, not for the Keychain entitlement itself.

### Recommended: App Store Connect API key

Create an appropriate App Store Connect API key under **Users and Access → Integrations**, then set:

```bash
export APPLE_API_ISSUER='YOUR_ISSUER_UUID'
export APPLE_API_KEY='YOUR_KEY_ID'
export APPLE_API_KEY_PATH="$HOME/.private_keys/AuthKey_${APPLE_API_KEY}.p8"

chmod 600 "$APPLE_API_KEY_PATH"
```

The `.p8` file is secret and must never be committed.

### Alternative: Apple ID

Use an app-specific password, not the normal Apple Account password:

```bash
export APPLE_ID='you@example.com'
export APPLE_TEAM_ID='YOUR_TEAM_ID'

read -s "APPLE_PASSWORD?Apple app-specific password: "
echo
export APPLE_PASSWORD
```

Tauri recognizes both authentication methods. See
[Tauri's notarization instructions](https://v2.tauri.app/distribute/sign/macos/#notarization).

## 5. Run release checks and build Universal 2

Install both Rust targets. On an Apple Silicon development Mac, the Intel target is normally the one
that still needs to be added:

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
```

Ensure the working tree contains only the intended release changes, then run the non-mutating
project gates:

```bash
git status --short
pnpm typecheck
pnpm lint
pnpm format:check
pnpm coverage:all
```

Build the Universal 2 application and disk image:

```bash
pnpm tauri build \
  --target universal-apple-darwin \
  --bundles app,dmg \
  --verbose
```

Do not use `--skip-stapling` for a final release. With the signing identity, embedded profile,
entitlements, and notarization credentials configured, Tauri should:

- compile the arm64 and Intel binaries;
- combine them into a Universal 2 application;
- embed the profile;
- sign the `.app` with the entitlements, Developer ID, and hardened runtime;
- submit, notarize, and staple the `.app`;
- package the stapled app into a signed `.dmg`.

The log must report successful signing, notarization acceptance, and app stapling. Do not release an
artifact if the log says signing or app notarization was skipped.

Expected output paths for OwnKeep 1.2.0:

```text
src-tauri/target/universal-apple-darwin/release/bundle/macos/OwnKeep.app
src-tauri/target/universal-apple-darwin/release/bundle/dmg/OwnKeep_1.2.0_universal.dmg
```

Tauri's DMG is a standard drag-to-Applications installer. See the
[Tauri DMG documentation](https://v2.tauri.app/distribute/dmg/).

### Apple Silicon-only alternative

If a release intentionally supports Apple Silicon only, use:

```bash
pnpm tauri build \
  --target aarch64-apple-darwin \
  --bundles app,dmg \
  --verbose
```

The remaining commands must then use the `aarch64-apple-darwin` target directory and the
`OwnKeep_1.2.0_aarch64.dmg` filename.

## 6. Verify entitlements, profile, and app signature

Set the Universal 2 artifact paths:

```bash
APP="$PWD/src-tauri/target/universal-apple-darwin/release/bundle/macos/OwnKeep.app"
DMG="$PWD/src-tauri/target/universal-apple-darwin/release/bundle/dmg/OwnKeep_1.2.0_universal.dmg"
```

Verify the embedded profile exists and decode it:

```bash
test -f "$APP/Contents/embedded.provisionprofile"
security cms -D \
  -i "$APP/Contents/embedded.provisionprofile" \
  > /tmp/ownkeep-embedded-profile.plist

/usr/libexec/PlistBuddy \
  -c 'Print :Entitlements' \
  /tmp/ownkeep-embedded-profile.plist
```

Extract the entitlements from the final signature rather than trusting the source plist:

```bash
codesign --display --entitlements - --xml "$APP" \
  > /tmp/ownkeep-signed-entitlements.plist
plutil -p /tmp/ownkeep-signed-entitlements.plist
```

The signed entitlements must contain:

```text
com.apple.application-identifier = APP_ID_PREFIX.com.shaojiang.ownkeep
com.apple.developer.team-identifier = TEAM_ID
```

It is expected that the final app signature does not contain `keychain-access-groups`. In that
case, the application identifier above is the private default group used by OwnKeep.

Then verify the app signature and stapled app ticket:

```bash
codesign --verify --deep --strict --verbose=2 "$APP"
xcrun stapler validate "$APP"

if command -v syspolicy_check >/dev/null 2>&1; then
  syspolicy_check distribution "$APP"
fi
```

Inspect the signing authority, Team ID, and hardened-runtime flag:

```bash
codesign -dv --verbose=4 "$APP" 2>&1 |
  grep -E 'Authority=|TeamIdentifier=|Identifier=|flags='
```

Stop if the embedded profile is missing, the signed entitlements are absent or different, the
profile does not authorize them, or the signature check fails. Notarization cannot repair any of
those problems.

## 7. Notarize and staple the final DMG

Tauri notarizes and staples the app before packaging it, then signs the resulting DMG. For the final
distribution workflow, also submit and staple the DMG itself. Apple recommends packaging already
notarized software into its installer and then notarizing the installer artifact.

With App Store Connect API-key authentication:

```bash
xcrun notarytool submit "$DMG" \
  --key "$APPLE_API_KEY_PATH" \
  --key-id "$APPLE_API_KEY" \
  --issuer "$APPLE_API_ISSUER" \
  --wait
```

With Apple-ID authentication:

```bash
xcrun notarytool submit "$DMG" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait
```

The result must say `status: Accepted`. After acceptance:

```bash
xcrun stapler staple "$DMG"
```

Apple's supported command-line workflow uses `notarytool` and `stapler`; do not use the retired
`altool`. See [Apple's notarization documentation](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).

## 8. Verify the final DMG

```bash
codesign --verify --verbose=2 "$DMG"
xcrun stapler validate "$DMG"

spctl --assess \
  --type open \
  --context context:primary-signature \
  --verbose=4 \
  "$DMG"

hdiutil verify "$DMG"
lipo -archs "$APP/Contents/MacOS/ownkeep"
```

For a Universal 2 build, `lipo` should report both architectures:

```text
x86_64 arm64
```

On macOS 14 and later, Apple recommends `syspolicy_check distribution` for applications. `spctl`
remains the appropriate quick assessment for disk images. See
[Apple's Gatekeeper guidance](https://developer.apple.com/forums/tags/gatekeeper).

## 9. Validate Touch ID from the signed app

Test the exact final stapled DMG on a second Mac when possible:

1. Download the DMG through a browser so macOS applies quarantine metadata.
2. Open it without bypassing Gatekeeper.
3. Drag OwnKeep into `/Applications` and launch it normally.
4. Enable Touch ID under **Settings → System → Security**.
5. Lock and unlock OwnKeep with Touch ID.
6. Cancel Touch ID once and confirm master-password fallback works.
7. Confirm the backup notice explains that Touch ID is excluded from backups.
8. Restore a backup and confirm Touch ID is off until it is enrolled again.

Also validate global-hotkey, notification, and Accessibility permission prompts. These permissions
are separate from the Keychain entitlement but should be tested against the same final signature.

From the first signed Touch ID release onward, keep the App ID prefix, Apple Team ID, bundle
identifier, and resulting private Keychain access group stable. Renewing a Developer ID certificate
within the same team normally preserves that app identity; ad-hoc signing, signing with another
team, or changing the identifiers does not. A fingerprint-set change invalidates a
`biometryCurrentSet` item independently and requires Touch ID re-enrollment. The master password
and recovery code remain unaffected.

## 10. Testing Touch ID during development

Use the correct test level:

| Build                                                                           | Native Touch ID result                                                                                                     |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `pnpm tauri dev` or a raw Cargo test executable                                 | Sensor availability may work; protected-key enrollment is expected to fail because no provisioning profile can be embedded |
| Packaged `.app` signed with Apple Development and a Mac App Development profile | Suitable for local native Touch ID testing; notarization is not required                                                   |
| Packaged `.app` signed with Developer ID and its Developer ID profile           | Suitable for release testing and public distribution after notarization                                                    |

For a signed development package, create a **Mac App Development** profile for the same explicit
App ID, include the test Mac as a registered device, and temporarily point the Tauri `files` entry at
that profile. Sign the packaged debug app with its matching Apple Development certificate:

```bash
export APPLE_SIGNING_IDENTITY='Apple Development: Your Name (TEAMID)'
unset APPLE_API_ISSUER APPLE_API_KEY APPLE_API_KEY_PATH
unset APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID

pnpm tauri build \
  --debug \
  --bundles app \
  --verbose
```

Set `APP` to the debug artifact, verify its embedded profile and signed entitlements with the
commands in section 6, then run the packaged `.app`:

```bash
APP="$PWD/src-tauri/target/debug/bundle/macos/OwnKeep.app"
```

Restore the Developer ID profile path before making a release. The existing OwnKeep debug Keychain
service suffix keeps development biometric items separate from production items, but avoid
installing a same-name debug bundle over the production app.

If Touch ID still reports `errSecMissingEntitlement` (`-34018`), check for these causes in order:

1. The process is a raw `tauri dev` or Cargo executable rather than the packaged `.app`.
2. `Contents/embedded.provisionprofile` is missing.
3. The final signature does not contain `com.apple.application-identifier` and
   `com.apple.developer.team-identifier` with the expected values.
4. The App ID prefix, Team ID, Bundle ID, or application-identifier value differs between the
   signature and profile.
5. The profile belongs to the wrong App ID or certificate, or has expired.
6. The app was re-signed after packaging without preserving the entitlements.
