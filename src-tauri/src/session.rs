//! The unlocked-vault session.
//!
//! The decrypted model and the DEK live here in the Rust core — never in the WebView (spec §4.5).
//! Provides auto-lock (idle timeout, §4.3), zeroize-on-lock (the decrypted state drops and
//! zeroizes), and optional failed-attempt backoff.

use std::path::Path;
use std::time::{Duration, Instant};

use zeroize::Zeroizing;

use crate::biometric::{self, BiometricKeyStore, BiometricStatus};
use crate::clipboard;
use crate::container::Container;
use crate::crypto::{self, Argon2Params, Key};
use crate::envelope;
use crate::error::{Error, Result};
use crate::recovery::EmergencyKit;
use crate::secrets;
use crate::storage;

/// Initial (empty) vault body for a freshly created vault. The structured model
/// (meta/settings/modules, spec §5) is built by the module registry in Phase 2; the crypto core
/// treats the body as opaque bytes.
const INITIAL_VAULT: &[u8] = b"{}";

/// Default auto-lock idle timeout for a fresh session (spec §4.3 default: 1 hour). Once a vault is
/// unlocked the effective timeout is overridden per-vault from `settings.autoLockMinutes` via
/// [`Session::set_auto_lock`]; this constant only covers the window before that sync.
pub const DEFAULT_AUTO_LOCK: Duration = Duration::from_secs(60 * 60);

/// Decrypted state held while the vault is unlocked. Every secret field zeroizes on drop.
struct UnlockedVault {
    container: Container,
    dek: Key,
    /// The decrypted vault model held in the Rust core (spec §3.2). It zeroizes on lock and is
    /// served to the frontend as a JSON projection via `vault_json` / `save_vault`.
    vault: Zeroizing<Vec<u8>>,
    last_activity: Instant,
}

/// The vault session: at most one unlocked vault plus lock/backoff bookkeeping.
pub struct Session {
    unlocked: Option<UnlockedVault>,
    /// Idle auto-lock timeout, or `None` for "never" (spec §4.3/§9). Set per-vault after unlock from
    /// `settings.autoLockMinutes` via [`Session::set_auto_lock`].
    auto_lock: Option<Duration>,
    failed_attempts: u32,
}

impl Session {
    pub fn new(auto_lock: Option<Duration>) -> Self {
        Self {
            unlocked: None,
            auto_lock,
            failed_attempts: 0,
        }
    }

    pub fn is_unlocked(&self) -> bool {
        self.unlocked.is_some()
    }

    /// Drop (and thereby zeroize) all decrypted state.
    pub fn lock(&mut self) {
        self.unlocked = None;
    }

    /// Update the idle auto-lock timeout at runtime (spec §4.3/§9). `None` disables it ("Never").
    pub fn set_auto_lock(&mut self, auto_lock: Option<Duration>) {
        self.auto_lock = auto_lock;
    }

    /// Whether the idle timeout has elapsed (used by the auto-lock task). A locked vault is never
    /// "expired".
    pub fn is_idle_expired(&self, now: Instant) -> bool {
        match (&self.unlocked, self.auto_lock) {
            (Some(u), Some(timeout)) => now.saturating_duration_since(u.last_activity) >= timeout,
            // Locked, or auto-lock set to "Never" — never idle-expires.
            _ => false,
        }
    }

    /// Delay to impose before the next unlock attempt (failed-attempt backoff, §4.3).
    pub fn backoff_delay(&self) -> Duration {
        backoff_delay(self.failed_attempts)
    }

    fn record_failure(&mut self) {
        self.failed_attempts = self.failed_attempts.saturating_add(1);
    }

    fn reset_failures(&mut self) {
        self.failed_attempts = 0;
    }

    /// Create a new vault at `path`, persist it, and leave the session unlocked. Returns the
    /// one-time Emergency Kit.
    pub fn create(
        &mut self,
        path: &Path,
        password: &str,
        argon: Argon2Params,
    ) -> Result<EmergencyKit> {
        let created = envelope::create_vault(password, INITIAL_VAULT, argon)?;
        storage::write_container(path, &created.container)?;
        self.unlocked = Some(UnlockedVault {
            container: created.container,
            dek: created.dek,
            vault: Zeroizing::new(INITIAL_VAULT.to_vec()),
            last_activity: Instant::now(),
        });
        self.reset_failures();
        Ok(created.emergency_kit)
    }

    /// Unlock with the master password.
    pub fn unlock_password(&mut self, path: &Path, password: &str) -> Result<()> {
        self.load(path, |c| envelope::unlock_with_password(c, password))
    }

    /// Unlock with the recovery code.
    pub fn unlock_recovery(&mut self, path: &Path, phrase: &str) -> Result<()> {
        self.load(path, |c| envelope::unlock_with_recovery(c, phrase))
    }

    /// Shared unlock path: read the container, derive the DEK via `derive`, decrypt the vault, and
    /// store the unlocked state. Counts a failure (for backoff) if the derive step is rejected.
    fn load<F>(&mut self, path: &Path, derive: F) -> Result<()>
    where
        F: FnOnce(&Container) -> Result<Key>,
    {
        let container = storage::read_container(path)?;
        let dek = match derive(&container) {
            Ok(dek) => dek,
            Err(e) => {
                self.record_failure();
                return Err(e);
            }
        };
        let vault = envelope::decrypt_vault(&container, &dek)?;
        self.unlocked = Some(UnlockedVault {
            container,
            dek,
            vault,
            last_activity: Instant::now(),
        });
        self.reset_failures();
        Ok(())
    }

    /// Restore a selected backup after proving the supplied master password can fully decrypt it.
    pub fn restore_password(
        &mut self,
        path: &Path,
        backup_path: &Path,
        password: &str,
        pre_restore_file_name: &str,
    ) -> Result<()> {
        self.restore_verified(path, backup_path, pre_restore_file_name, |container| {
            envelope::unlock_with_password(container, password)
        })
    }

    /// Restore a selected backup after proving the supplied recovery code can fully decrypt it.
    pub fn restore_recovery(
        &mut self,
        path: &Path,
        backup_path: &Path,
        phrase: &str,
        pre_restore_file_name: &str,
    ) -> Result<()> {
        self.restore_verified(path, backup_path, pre_restore_file_name, |container| {
            envelope::unlock_with_recovery(container, phrase)
        })
    }

    /// Shared restore path: read the chosen backup, derive its DEK, decrypt the vault body, then
    /// snapshot and atomically replace the active file. Nothing is written before decrypt succeeds.
    fn restore_verified<F>(
        &mut self,
        path: &Path,
        backup_path: &Path,
        pre_restore_file_name: &str,
        derive: F,
    ) -> Result<()>
    where
        F: FnOnce(&Container) -> Result<Key>,
    {
        storage::validate_backup_file_name(pre_restore_file_name)?;
        let container = storage::read_container(backup_path)?;
        let dek = match derive(&container) {
            Ok(dek) => dek,
            Err(e) => {
                self.record_failure();
                return Err(e);
            }
        };
        let vault = envelope::decrypt_vault(&container, &dek)?;

        if storage::vault_exists(path) {
            storage::backup_vault_file(path, pre_restore_file_name)?;
        }
        storage::write_container(path, &container)?;
        self.unlocked = Some(UnlockedVault {
            container,
            dek,
            vault,
            last_activity: Instant::now(),
        });
        self.reset_failures();
        Ok(())
    }

    /// Change the master password (re-wrap the DEK, fresh salt) and persist. Requires unlocked.
    pub fn change_master(
        &mut self,
        path: &Path,
        new_password: &str,
        argon: Argon2Params,
    ) -> Result<()> {
        let unlocked = self.unlocked.as_mut().ok_or(Error::Locked)?;
        envelope::set_master_password(&mut unlocked.container, &unlocked.dek, new_password, argon)?;
        storage::write_container(path, &unlocked.container)?;
        unlocked.last_activity = Instant::now();
        Ok(())
    }

    /// Regenerate the recovery code (re-wrap the DEK) and persist. Requires unlocked.
    pub fn regenerate_recovery(&mut self, path: &Path) -> Result<EmergencyKit> {
        let unlocked = self.unlocked.as_mut().ok_or(Error::Locked)?;
        let kit = envelope::regenerate_recovery(&mut unlocked.container, &unlocked.dek)?;
        storage::write_container(path, &unlocked.container)?;
        unlocked.last_activity = Instant::now();
        Ok(kit)
    }

    /// Enable Touch ID unlock (spec §4.7): store a fresh biometric KEK in the Keychain and wrap the
    /// DEK a third time. Requires the vault to be unlocked — the master password was already proven
    /// to reach this point, so Touch ID never becomes an independent way in.
    pub fn enable_biometric<S: BiometricKeyStore>(&mut self, path: &Path, store: &S) -> Result<()> {
        let unlocked = self.unlocked.as_mut().ok_or(Error::Locked)?;
        let kek = crypto::random_key()?;
        store.store_key(&kek)?;
        envelope::wrap_biometric(&mut unlocked.container, &unlocked.dek, &kek)?;
        storage::write_container(path, &unlocked.container)?;
        unlocked.last_activity = Instant::now();
        Ok(())
    }

    /// Disable Touch ID unlock: delete the Keychain key and drop the biometric wrap. The master
    /// password and recovery code still unlock (§4.7). Requires unlocked.
    pub fn disable_biometric<S: BiometricKeyStore>(&mut self, path: &Path, store: &S) -> Result<()> {
        let unlocked = self.unlocked.as_mut().ok_or(Error::Locked)?;
        store.delete_key()?;
        envelope::clear_biometric(&mut unlocked.container);
        storage::write_container(path, &unlocked.container)?;
        unlocked.last_activity = Instant::now();
        Ok(())
    }

    /// Re-enroll ("update") Touch ID with a fresh key + wrap. This is how the user recovers after a
    /// fingerprint-set change invalidates the Keychain item (§4.7). Requires unlocked. `store_key`
    /// replaces any prior item, so re-enroll is just enable.
    pub fn reenroll_biometric<S: BiometricKeyStore>(
        &mut self,
        path: &Path,
        store: &S,
    ) -> Result<()> {
        self.enable_biometric(path, store)
    }

    /// Unlock path C (spec §4.7): Touch ID releases the biometric KEK, which unwraps the DEK. A
    /// denied/canceled prompt errors before the derive step, so it is not counted as a backoff
    /// failure (unlike a wrong password).
    pub fn unlock_biometric<S: BiometricKeyStore>(&mut self, path: &Path, store: &S) -> Result<()> {
        let kek = store.load_key()?;
        self.load(path, |container| {
            envelope::unlock_with_biometric(container, &kek)
        })
    }

    /// Return the decrypted vault model as a redacted JSON projection. Requires unlocked.
    pub fn vault_json(&mut self) -> Result<String> {
        let unlocked = self.unlocked.as_mut().ok_or(Error::Locked)?;
        unlocked.last_activity = Instant::now();
        secrets::redact_projection(&unlocked.vault)
    }

    /// Replace the vault model with `json`, re-seal it under the DEK, and persist. Requires unlocked.
    pub fn save_vault(&mut self, path: &Path, json: &str) -> Result<()> {
        let unlocked = self.unlocked.as_mut().ok_or(Error::Locked)?;
        let full_json = secrets::merge_redacted_secrets(&unlocked.vault, json)?;
        envelope::reseal_vault(&mut unlocked.container, &unlocked.dek, &full_json)?;
        storage::write_container(path, &unlocked.container)?;
        unlocked.vault = Zeroizing::new(full_json);
        unlocked.last_activity = Instant::now();
        Ok(())
    }

    /// Copy a registered secret directly to the concealed pasteboard. Requires unlocked.
    pub fn copy_secret(&mut self, id: &str, field: &str) -> Result<()> {
        self.copy_secret_with_writer(id, field, |secret, clear_after| {
            clipboard::copy_concealed(secret, clear_after).map_err(Error::Format)
        })
    }

    /// Return a registered secret to Rust callers only. Requires unlocked.
    pub fn secret_value(&mut self, id: &str, field: &str) -> Result<Zeroizing<String>> {
        let unlocked = self.unlocked.as_mut().ok_or(Error::Locked)?;
        let secret = Zeroizing::new(secrets::find_secret(&unlocked.vault, id, field)?);
        unlocked.last_activity = Instant::now();
        Ok(secret)
    }

    fn copy_secret_with_writer<F>(&mut self, id: &str, field: &str, writer: F) -> Result<()>
    where
        F: FnOnce(&str, Duration) -> Result<()>,
    {
        let unlocked = self.unlocked.as_mut().ok_or(Error::Locked)?;
        let clear_after = Duration::from_secs(secrets::clipboard_clear_seconds(&unlocked.vault));
        let secret = Zeroizing::new(secrets::find_secret(&unlocked.vault, id, field)?);
        writer(&secret, clear_after)?;
        unlocked.last_activity = Instant::now();
        Ok(())
    }
}

/// Compute the Touch ID status for the vault at `path` (spec §4.7). Reads only the public container
/// header, so it needs no unlock and never triggers a Touch ID prompt. Pure over the store.
pub fn biometric_status<S: BiometricKeyStore>(path: &Path, store: &S) -> BiometricStatus {
    let wrap_present = storage::read_container(path)
        .map(|container| container.wrapped_biometric.is_some())
        .unwrap_or(false);
    biometric::status_from(store, wrap_present)
}

/// Map a user-facing auto-lock setting (`settings.autoLockMinutes`; `0` = never) to the session
/// timeout (spec §4.3/§9). Pure, so the frontend's option set is exercised without a live session.
pub fn auto_lock_from_minutes(minutes: u64) -> Option<Duration> {
    if minutes == 0 {
        None
    } else {
        Some(Duration::from_secs(minutes * 60))
    }
}

/// Pure backoff schedule: no delay for the first few failures, then exponential up to a 30s cap.
pub fn backoff_delay(failed_attempts: u32) -> Duration {
    const FREE_ATTEMPTS: u32 = 3;
    const CAP_SECS: u64 = 30;
    if failed_attempts <= FREE_ATTEMPTS {
        Duration::ZERO
    } else {
        let steps = failed_attempts - FREE_ATTEMPTS; // 1, 2, 3, ...
        let secs = 2u64.saturating_pow(steps).min(CAP_SECS);
        Duration::from_secs(secs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::TEST_ARGON;
    use crate::storage::{unique_temp_dir, VAULT_FILE};
    use std::fs;

    fn session() -> Session {
        Session::new(Some(DEFAULT_AUTO_LOCK))
    }

    #[test]
    fn backoff_grows_after_free_attempts() {
        assert_eq!(backoff_delay(0), Duration::ZERO);
        assert_eq!(backoff_delay(3), Duration::ZERO);
        assert_eq!(backoff_delay(4), Duration::from_secs(2));
        assert_eq!(backoff_delay(5), Duration::from_secs(4));
        assert_eq!(backoff_delay(6), Duration::from_secs(8));
        assert_eq!(backoff_delay(8), Duration::from_secs(30)); // capped
        assert_eq!(backoff_delay(20), Duration::from_secs(30));
    }

    #[test]
    fn create_unlocks_then_lock_clears() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let mut s = session();
        let kit = s.create(&path, "master pw", TEST_ARGON).unwrap();
        assert!(s.is_unlocked());
        assert_eq!(kit.recovery_code.split_whitespace().count(), 12);
        s.lock();
        assert!(!s.is_unlocked());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reopen_with_password_and_recovery() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let mut s = session();
        let kit = s.create(&path, "master pw", TEST_ARGON).unwrap();
        let code = kit.recovery_code.clone();
        s.lock();

        s.unlock_password(&path, "master pw").unwrap();
        assert!(s.is_unlocked());
        s.lock();

        s.unlock_recovery(&path, &code).unwrap();
        assert!(s.is_unlocked());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn wrong_password_keeps_locked_and_counts_failure() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let mut s = session();
        s.create(&path, "master pw", TEST_ARGON).unwrap();
        s.lock();

        for _ in 0..4 {
            assert!(s.unlock_password(&path, "wrong").is_err());
            assert!(!s.is_unlocked());
        }
        assert!(s.backoff_delay() > Duration::ZERO);

        // A correct unlock clears the backoff.
        s.unlock_password(&path, "master pw").unwrap();
        assert_eq!(s.backoff_delay(), Duration::ZERO);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn idle_expiry_depends_on_timeout() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);

        let mut immediate = Session::new(Some(Duration::ZERO));
        immediate.create(&path, "pw", TEST_ARGON).unwrap();
        assert!(immediate.is_idle_expired(Instant::now()));

        let mut patient = Session::new(Some(Duration::from_secs(3600)));
        patient.create(&path, "pw", TEST_ARGON).unwrap();
        assert!(!patient.is_idle_expired(Instant::now()));
        patient.lock();
        assert!(!patient.is_idle_expired(Instant::now())); // locked → never expired
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn auto_lock_minutes_map_to_timeout_or_never() {
        assert_eq!(auto_lock_from_minutes(5), Some(Duration::from_secs(300)));
        assert_eq!(auto_lock_from_minutes(60), Some(Duration::from_secs(3600)));
        assert_eq!(
            auto_lock_from_minutes(180),
            Some(Duration::from_secs(10800))
        );
        assert_eq!(auto_lock_from_minutes(0), None); // "Never"
    }

    #[test]
    fn never_auto_lock_never_idle_expires() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let mut s = Session::new(None); // "Never"
        s.create(&path, "pw", TEST_ARGON).unwrap();
        // Even far in the future, a "Never" session stays unlocked.
        assert!(!s.is_idle_expired(Instant::now() + Duration::from_secs(10 * 3600)));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn set_auto_lock_changes_the_effective_timeout() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let mut s = Session::new(Some(Duration::from_secs(3600))); // 1 hour
        s.create(&path, "pw", TEST_ARGON).unwrap();
        let ten_min_later = Instant::now() + Duration::from_secs(600);
        assert!(!s.is_idle_expired(ten_min_later)); // 1h not reached

        s.set_auto_lock(auto_lock_from_minutes(5)); // tighten to 5 min
        assert!(s.is_idle_expired(ten_min_later)); // now expired

        s.set_auto_lock(auto_lock_from_minutes(0)); // "Never"
        assert!(!s.is_idle_expired(ten_min_later));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn mutations_require_unlock() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let mut s = session();
        assert!(matches!(
            s.change_master(&path, "x", TEST_ARGON),
            Err(Error::Locked)
        ));
        assert!(matches!(s.regenerate_recovery(&path), Err(Error::Locked)));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn change_master_then_reopen_with_new_password() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let mut s = session();
        s.create(&path, "old pw", TEST_ARGON).unwrap();
        s.change_master(&path, "new pw", TEST_ARGON).unwrap();
        s.lock();
        assert!(s.unlock_password(&path, "old pw").is_err());
        s.unlock_password(&path, "new pw").unwrap();
        assert!(s.is_unlocked());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn get_and_save_vault_round_trip_and_persist() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let mut s = session();
        s.create(&path, "pw", TEST_ARGON).unwrap();
        assert_eq!(s.vault_json().unwrap(), "{}"); // INITIAL_VAULT

        let model = r#"{"settings":{"theme":"dark"}}"#;
        s.save_vault(&path, model).unwrap();
        assert_eq!(s.vault_json().unwrap(), model);

        // Persisted across a lock/unlock cycle.
        s.lock();
        s.unlock_password(&path, "pw").unwrap();
        assert_eq!(s.vault_json().unwrap(), model);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn vault_json_redacts_passwords_and_save_preserves_them() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let mut s = session();
        s.create(&path, "pw", TEST_ARGON).unwrap();
        let full = r#"{
          "settings":{"clipboardClearSeconds":5},
          "modules":{"passwords":[{"id":"1","name":"GitHub","username":"sha","password":"secret","updatedAt":"now"}]}
        }"#;
        s.save_vault(&path, full).unwrap();

        let projection = s.vault_json().unwrap();
        assert!(!projection.contains("secret"));
        assert!(projection.contains(crate::secrets::REDACTED_SECRET));

        s.save_vault(&path, &projection).unwrap();
        s.copy_secret_with_writer("1", "password", |secret, clear_after| {
            assert_eq!(secret, "secret");
            assert_eq!(clear_after, Duration::from_secs(5));
            Ok(())
        })
        .unwrap();
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn copy_secret_requires_unlock_and_registered_field() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let mut s = session();
        assert!(matches!(
            s.copy_secret_with_writer("1", "password", |_, _| Ok(())),
            Err(Error::Locked)
        ));

        s.create(&path, "pw", TEST_ARGON).unwrap();
        s.save_vault(
            &path,
            r#"{"modules":{"passwords":[{"id":"1","password":"secret"}]}}"#,
        )
        .unwrap();
        assert!(s
            .copy_secret_with_writer("1", "username", |_, _| Ok(()))
            .is_err());
        assert!(s.secret_value("1", "username").is_err());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn vault_access_requires_unlock() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let mut s = session();
        assert!(matches!(s.vault_json(), Err(Error::Locked)));
        assert!(matches!(s.save_vault(&path, "{}"), Err(Error::Locked)));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn opening_an_older_container_upgrades_it_on_save() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let mut s = session();
        s.create(&path, "pw", TEST_ARGON).unwrap();
        s.lock();

        // Simulate a vault written by an older container format (same shape, lower version tag).
        let mut container = crate::storage::read_container(&path).unwrap();
        container.version = crate::container::MIN_READABLE_VERSION;
        crate::storage::write_container(&path, &container).unwrap();

        // The retained reader opens it; the first accepted save re-seals into the current format.
        s.unlock_password(&path, "pw").unwrap();
        s.save_vault(&path, r#"{"meta":{"schemaVersion":2}}"#)
            .unwrap();

        assert_eq!(
            crate::storage::read_container(&path).unwrap().version,
            crate::container::VERSION
        );
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn restore_refuses_wrong_password_before_replacing_or_snapshotting() {
        let dir = unique_temp_dir();
        let active_path = dir.join(VAULT_FILE);
        let backup_path = dir.join("keystash-v0.1-20260707-1530.dat");

        let mut active = session();
        active
            .create(&active_path, "current pw", TEST_ARGON)
            .unwrap();
        active
            .save_vault(&active_path, r#"{"settings":{"theme":"dark"}}"#)
            .unwrap();
        let before = fs::read(&active_path).unwrap();

        let mut backup = session();
        backup
            .create(&backup_path, "backup pw", TEST_ARGON)
            .unwrap();
        backup
            .save_vault(&backup_path, r#"{"settings":{"theme":"light"}}"#)
            .unwrap();

        assert!(active
            .restore_password(
                &active_path,
                &backup_path,
                "wrong pw",
                "keystash-pre-restore-20260707-1530.dat",
            )
            .is_err());

        assert_eq!(fs::read(&active_path).unwrap(), before);
        assert!(!dir.join("keystash-pre-restore-20260707-1530.dat").exists());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn restore_with_password_snapshots_replaces_and_unlocks_backup() {
        let dir = unique_temp_dir();
        let active_path = dir.join(VAULT_FILE);
        let backup_path = dir.join("keystash-v0.1-20260707-1530.dat");
        let pre_restore = "keystash-pre-restore-20260707-1530.dat";

        let mut active = session();
        active
            .create(&active_path, "current pw", TEST_ARGON)
            .unwrap();
        active
            .save_vault(&active_path, r#"{"settings":{"theme":"dark"}}"#)
            .unwrap();

        let mut backup = session();
        backup
            .create(&backup_path, "backup pw", TEST_ARGON)
            .unwrap();
        backup
            .save_vault(&backup_path, r#"{"settings":{"theme":"light"}}"#)
            .unwrap();

        active
            .restore_password(&active_path, &backup_path, "backup pw", pre_restore)
            .unwrap();

        assert_eq!(
            active.vault_json().unwrap(),
            r#"{"settings":{"theme":"light"}}"#,
        );
        assert!(dir.join(pre_restore).exists());
        active.lock();
        assert!(active.unlock_password(&active_path, "current pw").is_err());
        active.unlock_password(&active_path, "backup pw").unwrap();
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn restore_with_recovery_uses_the_backup_recovery_wrap() {
        let dir = unique_temp_dir();
        let active_path = dir.join(VAULT_FILE);
        let backup_path = dir.join("keystash-v0.1-20260707-1530.dat");

        let mut active = session();
        active
            .create(&active_path, "current pw", TEST_ARGON)
            .unwrap();

        let mut backup = session();
        let kit = backup
            .create(&backup_path, "backup pw", TEST_ARGON)
            .unwrap();
        backup
            .save_vault(&backup_path, r#"{"settings":{"resultLimit":5}}"#)
            .unwrap();

        active
            .restore_recovery(
                &active_path,
                &backup_path,
                &kit.recovery_code,
                "keystash-pre-restore-20260707-1531.dat",
            )
            .unwrap();

        assert_eq!(
            active.vault_json().unwrap(),
            r#"{"settings":{"resultLimit":5}}"#,
        );
        fs::remove_dir_all(&dir).ok();
    }

    // --- Touch ID biometric unlock (spec §4.7) ---
    use crate::biometric::testing::FakeBiometricKeyStore;

    #[test]
    fn enable_then_unlock_with_biometric() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let store = FakeBiometricKeyStore::available();
        let mut s = session();
        s.create(&path, "pw", TEST_ARGON).unwrap();

        // Not enrolled until enabled.
        assert!(!biometric_status(&path, &store).enrolled);
        s.enable_biometric(&path, &store).unwrap();
        assert!(store.has_key());
        assert!(biometric_status(&path, &store).enrolled);

        // Path C unlocks the vault after a lock.
        s.lock();
        s.unlock_biometric(&path, &store).unwrap();
        assert!(s.is_unlocked());
        // The DEK matches — the projection round-trips.
        assert_eq!(s.vault_json().unwrap(), "{}");
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn disable_biometric_clears_key_and_wrap_but_password_still_unlocks() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let store = FakeBiometricKeyStore::available();
        let mut s = session();
        s.create(&path, "pw", TEST_ARGON).unwrap();
        s.enable_biometric(&path, &store).unwrap();

        s.disable_biometric(&path, &store).unwrap();
        assert!(!store.has_key());
        assert!(!biometric_status(&path, &store).enrolled);

        s.lock();
        assert!(matches!(
            s.unlock_biometric(&path, &store),
            Err(Error::BiometricNotEnrolled)
        ));
        // The authoritative credential always works (§4.7).
        s.unlock_password(&path, "pw").unwrap();
        assert!(s.is_unlocked());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn biometric_management_requires_unlock() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let store = FakeBiometricKeyStore::available();
        let mut s = session();
        assert!(matches!(
            s.enable_biometric(&path, &store),
            Err(Error::Locked)
        ));
        assert!(matches!(
            s.disable_biometric(&path, &store),
            Err(Error::Locked)
        ));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reenroll_issues_a_fresh_key_that_still_unlocks() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let store = FakeBiometricKeyStore::available();
        let mut s = session();
        s.create(&path, "pw", TEST_ARGON).unwrap();
        s.enable_biometric(&path, &store).unwrap();

        s.reenroll_biometric(&path, &store).unwrap();
        assert!(biometric_status(&path, &store).enrolled);
        s.lock();
        s.unlock_biometric(&path, &store).unwrap();
        assert!(s.is_unlocked());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn canceled_touch_id_prompt_is_not_a_backoff_failure() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let mut s = session();
        s.create(&path, "pw", TEST_ARGON).unwrap();
        s.lock();

        // Available + has a key, but the prompt is denied/canceled — the load fails before any
        // container derive, so no backoff failure is counted.
        let store = FakeBiometricKeyStore {
            available: true,
            key: std::sync::Mutex::new(Some(crate::crypto::random_key().unwrap())),
            load_should_fail: true,
        };
        assert!(s.unlock_biometric(&path, &store).is_err());
        assert!(!s.is_unlocked());
        assert_eq!(s.backoff_delay(), Duration::ZERO);
        fs::remove_dir_all(&dir).ok();
    }
}
