//! Touch ID biometric unlock (spec §4.7).
//!
//! Touch ID is an *optional, device-local* shortcut. A random 256-bit `KEK_biometric` is held in the
//! macOS Keychain behind a biometric-gated access control and wraps the DEK a third time
//! (`envelope::wrap_biometric`). The **master password and recovery code remain the only
//! authoritative credentials** — this module only guards the convenience key, never replaces them.
//!
//! The OS boundary is the [`BiometricKeyStore`] trait, so the enable/disable/unlock/status *logic*
//! (in `session.rs`) is unit-tested with a fake. The real Keychain + LocalAuthentication calls live
//! behind `#[cfg(target_os = "macos")]` and are validated manually (no Touch ID in CI).

use serde::Serialize;
use zeroize::Zeroizing;

use crate::crypto::{Key, KEY_LEN};
use crate::error::{Error, Result};

/// Touch ID status surfaced to the frontend (serialized as `{ available, enrolled }`, spec §4.7).
#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct BiometricStatus {
    /// Touch ID hardware is present and a fingerprint is enrolled on this Mac.
    pub available: bool,
    /// OwnKeep has a biometric key for this vault: the container wrap *and* the Keychain item exist.
    pub enrolled: bool,
}

/// The device-local, offline OS boundary for the biometric wrapping key. Mocked in tests.
pub trait BiometricKeyStore {
    /// Whether Touch ID can be used on this Mac right now (sensor present + a fingerprint enrolled).
    fn is_available(&self) -> bool;
    /// Whether OwnKeep's biometric key item exists — a non-prompting check (never shows Touch ID).
    fn has_key(&self) -> bool;
    /// Store (creating or replacing) the biometric-gated wrapping key.
    fn store_key(&self, key: &Key) -> Result<()>;
    /// Read the wrapping key back, prompting Touch ID. Errors if absent or the prompt fails.
    fn load_key(&self) -> Result<Key>;
    /// Delete the key item. Absent is success (idempotent).
    fn delete_key(&self) -> Result<()>;
}

/// Derive the Touch ID status from the store plus whether the on-disk container carries a wrap
/// (spec §4.7). Pure over the trait, so it is exercised without hardware. `enrolled` requires all
/// three: hardware available, the container wrap present, and the Keychain key present.
pub fn status_from<S: BiometricKeyStore + ?Sized>(
    store: &S,
    wrap_present: bool,
) -> BiometricStatus {
    let available = store.is_available();
    BiometricStatus {
        available,
        enrolled: available && wrap_present && store.has_key(),
    }
}

/// Convert stored Keychain bytes into a 32-byte key, rejecting a wrong length.
fn key_from_bytes(bytes: &[u8]) -> Result<Key> {
    if bytes.len() != KEY_LEN {
        return Err(Error::Biometric(
            "stored biometric key had an unexpected length".to_string(),
        ));
    }
    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    key.copy_from_slice(bytes);
    Ok(key)
}

/// The real OS-backed store: macOS Keychain + LocalAuthentication (spec §4.7); a no-op elsewhere.
pub struct SystemBiometricKeyStore;

impl SystemBiometricKeyStore {
    pub fn new() -> Self {
        Self
    }
}

impl Default for SystemBiometricKeyStore {
    fn default() -> Self {
        Self::new()
    }
}

/// Construct the platform biometric store for the command layer.
pub fn system_store() -> SystemBiometricKeyStore {
    SystemBiometricKeyStore::new()
}

// --- macOS implementation -------------------------------------------------------------------------

/// Keychain item identity for the biometric wrapping key. Release, debug, and test builds must not
/// share an item: a debug enrollment or a Keychain-writing test must never replace/delete the
/// production app's device-local Touch ID key.
#[cfg(target_os = "macos")]
const fn keychain_service_for(test_build: bool, debug_build: bool) -> &'static str {
    if test_build {
        "com.shaojiang.ownkeep.biometric.test"
    } else if debug_build {
        "com.shaojiang.ownkeep.biometric.dev"
    } else {
        "com.shaojiang.ownkeep.biometric"
    }
}

#[cfg(target_os = "macos")]
const KEYCHAIN_SERVICE: &str = keychain_service_for(cfg!(test), cfg!(debug_assertions));
#[cfg(target_os = "macos")]
const KEYCHAIN_ACCOUNT: &str = "vault-kek";

/// The query identifying OwnKeep's biometric item — shared by store / load / delete so all three
/// address the *same* item in the *same* Keychain.
///
/// macOS `SecItem` calls default to the **legacy file-based Keychain**, which cannot hold a
/// biometric-gated `SecAccessControl`. Only the **data-protection Keychain** can, so every query
/// must opt in via `kSecUseDataProtectionKeychain`; without it the item is written to — and looked
/// for in — the wrong store, and enrollment fails even on a correctly signed build. Deliberately
/// *not* `kSecAttrSynchronizable`, which would opt into iCloud sync and break the device-local
/// design (spec §4.7).
///
/// This call site doubles as the compile-time guard for the `security-framework/OSX_10_15` feature:
/// `use_protected_keychain` does not exist without it, whereas `has_key`'s search silently falls
/// back to the legacy Keychain instead of failing to build.
#[cfg(target_os = "macos")]
fn protected_item_query() -> security_framework::passwords_options::PasswordOptions {
    use security_framework::passwords_options::PasswordOptions;

    let mut options = PasswordOptions::new_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    options.use_protected_keychain();
    options
}

#[cfg(target_os = "macos")]
impl BiometricKeyStore for SystemBiometricKeyStore {
    fn is_available(&self) -> bool {
        use objc2_local_authentication::{LAContext, LAPolicy};
        // canEvaluatePolicy is true only when the sensor is present and a fingerprint is enrolled.
        let context = unsafe { LAContext::new() };
        unsafe {
            context.canEvaluatePolicy_error(LAPolicy::DeviceOwnerAuthenticationWithBiometrics)
        }
        .is_ok()
    }

    fn has_key(&self) -> bool {
        use security_framework::item::{ItemClass, ItemSearchOptions, Limit};
        // Attributes-only search: `load_data(false)` means the protected data is never read, so this
        // existence probe does NOT trigger a Touch ID prompt (it runs on the lock screen).
        // `ignore_legacy_keychains` is this builder's spelling of `kSecUseDataProtectionKeychain`,
        // so the probe looks in the same Keychain `protected_item_query` writes to.
        ItemSearchOptions::new()
            .class(ItemClass::generic_password())
            .service(KEYCHAIN_SERVICE)
            .account(KEYCHAIN_ACCOUNT)
            .ignore_legacy_keychains()
            .load_attributes(true)
            .load_data(false)
            .limit(Limit::Max(1))
            .search()
            .map(|results| !results.is_empty())
            .unwrap_or(false)
    }

    fn store_key(&self, key: &Key) -> Result<()> {
        use security_framework::access_control::{ProtectionMode, SecAccessControl};
        use security_framework::passwords::set_generic_password_options;
        use security_framework::passwords_options::AccessControlOptions;

        // BiometryCurrentSet: adding/removing a fingerprint invalidates the item (→ re-enroll, §4.7).
        // WhenUnlockedThisDeviceOnly: never leaves the device, never syncs to iCloud Keychain.
        let access_control = SecAccessControl::create_with_protection(
            Some(ProtectionMode::AccessibleWhenUnlockedThisDeviceOnly),
            AccessControlOptions::BIOMETRY_CURRENT_SET.bits(),
        )
        .map_err(sf_err)?;

        // Replace any prior item so enable / re-enroll always issues a fresh key.
        self.delete_key()?;

        let mut options = protected_item_query();
        options.set_access_control(access_control);
        set_generic_password_options(key.as_slice(), options).map_err(sf_err)
    }

    fn load_key(&self) -> Result<Key> {
        use security_framework::passwords::generic_password;
        // Reading the biometric-gated item triggers the Touch ID prompt (unlock path C, §4.7).
        let bytes = generic_password(protected_item_query()).map_err(sf_err)?;
        key_from_bytes(&bytes)
    }

    fn delete_key(&self) -> Result<()> {
        use security_framework::passwords::delete_generic_password_options;
        // Idempotent: only delete when present, so an absent item is not treated as an error.
        // The options form is required over `delete_generic_password`, which builds its own query
        // and so would target the legacy Keychain.
        if self.has_key() {
            delete_generic_password_options(protected_item_query()).map_err(sf_err)?;
        }
        Ok(())
    }
}

/// Map a Security-framework error onto our coarse biometric error.
#[cfg(target_os = "macos")]
fn sf_err(error: security_framework::base::Error) -> Error {
    Error::Biometric(error.to_string())
}

// --- non-macOS stub -------------------------------------------------------------------------------

#[cfg(not(target_os = "macos"))]
impl BiometricKeyStore for SystemBiometricKeyStore {
    fn is_available(&self) -> bool {
        false
    }
    fn has_key(&self) -> bool {
        false
    }
    fn store_key(&self, _key: &Key) -> Result<()> {
        Err(Error::Biometric(
            "biometric unlock is macOS-only".to_string(),
        ))
    }
    fn load_key(&self) -> Result<Key> {
        Err(Error::BiometricNotEnrolled)
    }
    fn delete_key(&self) -> Result<()> {
        Ok(())
    }
}

// --- test fake ------------------------------------------------------------------------------------

#[cfg(test)]
pub(crate) mod testing {
    use super::*;
    use std::sync::Mutex;

    /// In-memory fake of the OS keychain so the session logic is tested without hardware. The real
    /// Keychain/LocalAuthentication path is validated manually (plan Phase 13).
    pub struct FakeBiometricKeyStore {
        pub available: bool,
        pub key: Mutex<Option<Key>>,
        /// Simulate a denied / canceled Touch ID prompt on the next `load_key`.
        pub load_should_fail: bool,
    }

    impl FakeBiometricKeyStore {
        pub fn available() -> Self {
            Self {
                available: true,
                key: Mutex::new(None),
                load_should_fail: false,
            }
        }

        pub fn unavailable() -> Self {
            Self {
                available: false,
                key: Mutex::new(None),
                load_should_fail: false,
            }
        }
    }

    impl BiometricKeyStore for FakeBiometricKeyStore {
        fn is_available(&self) -> bool {
            self.available
        }
        fn has_key(&self) -> bool {
            self.key.lock().unwrap().is_some()
        }
        fn store_key(&self, key: &Key) -> Result<()> {
            *self.key.lock().unwrap() = Some(key.clone());
            Ok(())
        }
        fn load_key(&self) -> Result<Key> {
            if self.load_should_fail {
                return Err(Error::Biometric("prompt canceled".to_string()));
            }
            self.key
                .lock()
                .unwrap()
                .clone()
                .ok_or(Error::BiometricNotEnrolled)
        }
        fn delete_key(&self) -> Result<()> {
            *self.key.lock().unwrap() = None;
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::testing::FakeBiometricKeyStore;
    use super::*;
    use crate::crypto::random_key;

    #[test]
    fn enrolled_requires_available_wrap_and_key() {
        let store = FakeBiometricKeyStore::available();
        // Available but neither wrap nor key → not enrolled.
        assert_eq!(
            status_from(&store, false),
            BiometricStatus {
                available: true,
                enrolled: false
            }
        );
        // Wrap present but no Keychain key → not enrolled.
        assert!(!status_from(&store, true).enrolled);
        // Both present → enrolled.
        store.store_key(&random_key().unwrap()).unwrap();
        assert!(status_from(&store, true).enrolled);
        // Key present but wrap absent → not enrolled.
        assert!(!status_from(&store, false).enrolled);
    }

    #[test]
    fn unavailable_hardware_is_never_enrolled() {
        let store = FakeBiometricKeyStore::unavailable();
        store.store_key(&random_key().unwrap()).unwrap();
        assert_eq!(
            status_from(&store, true),
            BiometricStatus {
                available: false,
                enrolled: false
            }
        );
    }

    #[test]
    fn key_from_bytes_rejects_wrong_length() {
        assert!(key_from_bytes(&[0u8; 10]).is_err());
        assert!(key_from_bytes(&[0u8; KEY_LEN]).is_ok());
    }

    #[test]
    fn fake_store_round_trips_and_deletes() {
        let store = FakeBiometricKeyStore::available();
        assert!(!store.has_key());
        let key = random_key().unwrap();
        store.store_key(&key).unwrap();
        assert!(store.has_key());
        assert_eq!(store.load_key().unwrap()[..], key[..]);
        store.delete_key().unwrap();
        assert!(!store.has_key());
        assert!(matches!(store.load_key(), Err(Error::BiometricNotEnrolled)));
    }

    /// Every `kSec*` key the store / load / delete query is allowed to carry, as the four-character
    /// wire values Security.framework uses: `class` (`kSecClass`), `svce` (`kSecAttrService`),
    /// `acct` (`kSecAttrAccount`), and `nleg` (`kSecUseDataProtectionKeychain`).
    #[cfg(target_os = "macos")]
    const EXPECTED_QUERY_KEYS: [&str; 4] = ["acct", "class", "nleg", "svce"];

    /// Pins the exact query OwnKeep hands to macOS. Two §4.7 constraints regress silently and are
    /// invisible without a signed build, so they are asserted rather than discovered on-device:
    /// dropping `nleg` sends the query to the legacy Keychain, which cannot hold a biometric-gated
    /// item; adding `sync` (`kSecAttrSynchronizable`) would opt the wrapping key into iCloud.
    /// Asserting the whole set — not just `nleg`'s presence — is what catches the second one.
    ///
    /// `has_key`'s search cannot be covered this way: `ItemSearchOptions` keeps its query private,
    /// so that path stays covered by the manual on-device check (plan Phase 13).
    #[cfg(target_os = "macos")]
    #[test]
    fn protected_query_targets_data_protection_keychain_and_nothing_else() {
        #[allow(deprecated)]
        let mut keys: Vec<String> = protected_item_query()
            .query
            .iter()
            .map(|(key, _)| key.to_string())
            .collect();
        keys.sort();

        assert_eq!(keys, EXPECTED_QUERY_KEYS);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn keychain_services_are_isolated_by_build_channel() {
        let production = keychain_service_for(false, false);
        let development = keychain_service_for(false, true);
        let tests = keychain_service_for(true, true);

        assert_eq!(production, "com.shaojiang.ownkeep.biometric");
        assert_eq!(development, "com.shaojiang.ownkeep.biometric.dev");
        assert_eq!(tests, "com.shaojiang.ownkeep.biometric.test");
        assert_ne!(production, development);
        assert_ne!(production, tests);
        assert_ne!(development, tests);
        assert_eq!(KEYCHAIN_SERVICE, tests);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn diag_store_key_reports_the_real_error() {
        let store = SystemBiometricKeyStore::new();
        println!(
            "DIAG available={} has_key={}",
            store.is_available(),
            store.has_key()
        );
        let key = crate::crypto::random_key().unwrap();
        match store.store_key(&key) {
            Ok(()) => {
                println!("DIAG STORE OK");
                let _ = store.delete_key();
            }
            Err(e) => println!("DIAG STORE ERR: {e}"),
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn system_store_probes_are_non_prompting() {
        // Best-effort on the macOS test host: the availability + existence probes run on the lock
        // screen and in settings, so they must never prompt or panic. They are read-only, so this
        // does not touch any real enrollment (store/load are validated manually — plan Phase 13).
        let store = SystemBiometricKeyStore::new();
        let _ = store.is_available();
        let _ = store.has_key();
    }
}
