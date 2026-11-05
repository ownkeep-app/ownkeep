//! The unlocked-vault session.
//!
//! The decrypted model and the DEK live here in the Rust core — never in the WebView (spec §4.5).
//! Provides auto-lock (idle timeout, §4.3), zeroize-on-lock (the decrypted state drops and
//! zeroizes), and optional failed-attempt backoff.

use std::path::Path;
use std::time::{Duration, Instant};

use zeroize::Zeroizing;

use crate::archive;
use crate::biometric::{self, BiometricKeyStore, BiometricStatus};
use crate::blobs::{self, Progress};
use crate::clipboard;
use crate::container::Container;
use crate::crypto::{self, Argon2Params, Key};
use crate::envelope;
use crate::error::{Error, Result};
use crate::i18n::Locale;
use crate::recovery::EmergencyKit;
use crate::reminders::{self, Reminder};
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

    /// Count a rejected restore credential towards the unlock backoff (§4.3).
    pub fn record_restore_failure(&mut self) {
        self.record_failure();
    }

    /// Switch to a verified backup: snapshot the current vault, atomically replace the live file, swap
    /// in the staged file blobs, and unlock. The two steps can't be one atomic rename, so a crash
    /// between them leaves the new vault with the old blobs; the snapshot written first still holds
    /// everything, and this window is two renames long.
    pub fn commit_restore(
        &mut self,
        path: &Path,
        prepared: PreparedRestore,
        pre_restore_file_name: &str,
    ) -> Result<()> {
        if storage::vault_exists(path) {
            storage::backup_vault_file(path, pre_restore_file_name)?;
        }
        storage::write_container(path, &prepared.container)?;
        blobs::replace_dir(&prepared.staged_files, &blobs::dir_for(path))?;
        self.unlocked = Some(UnlockedVault {
            container: prepared.container,
            dek: prepared.dek,
            vault: prepared.vault,
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

    /// Change the master password from an unlocked session, proving the current one first: being
    /// unlocked isn't enough, or anyone at an unattended Mac could lock the owner out. A wrong password
    /// counts towards the same backoff as the lock screen. Requires unlocked.
    pub fn change_master_verified(
        &mut self,
        path: &Path,
        current_password: &str,
        new_password: &str,
        argon: Argon2Params,
    ) -> Result<()> {
        let unlocked = self.unlocked.as_ref().ok_or(Error::Locked)?;
        if let Err(e) = envelope::unlock_with_password(&unlocked.container, current_password) {
            self.record_failure();
            return Err(e);
        }
        self.reset_failures();
        self.change_master(path, new_password, argon)
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
    pub fn disable_biometric<S: BiometricKeyStore>(
        &mut self,
        path: &Path,
        store: &S,
    ) -> Result<()> {
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

    /// The key that seals file blobs (spec §4.8). Asking for it counts as activity, so previewing or
    /// transferring a file keeps the vault from auto-locking underneath it. Requires unlocked.
    pub fn files_key(&mut self) -> Result<Key> {
        let unlocked = self.unlocked.as_mut().ok_or(Error::Locked)?;
        unlocked.last_activity = Instant::now();
        crypto::derive_files_key(&unlocked.dek)
    }

    /// Mark a long-running background transfer as activity if unlocked; a no-op while locked, since a
    /// locked vault can still be backed up.
    pub fn touch(&mut self) {
        if let Some(unlocked) = self.unlocked.as_mut() {
            unlocked.last_activity = Instant::now();
        }
    }

    /// Return the decrypted vault model as a redacted JSON projection. Requires unlocked.
    pub fn vault_json(&mut self) -> Result<String> {
        let unlocked = self.unlocked.as_mut().ok_or(Error::Locked)?;
        unlocked.last_activity = Instant::now();
        secrets::redact_projection(&unlocked.vault)
    }

    /// Collect due reminders and persist auto-renew invoice roll-forward. Does not count as user
    /// activity (background scheduler). Returns reminders from the pre-roll snapshot.
    pub fn process_due_reminders(
        &mut self,
        path: &Path,
        now: chrono::DateTime<chrono::Utc>,
        locale: Locale,
    ) -> Result<(Vec<Reminder>, bool)> {
        let unlocked = self.unlocked.as_mut().ok_or(Error::Locked)?;
        let tick = reminders::process_reminders(&unlocked.vault, now, locale);
        let mut vault_changed = false;
        if let Some(updated) = tick.vault {
            envelope::reseal_vault(&mut unlocked.container, &unlocked.dek, &updated)?;
            storage::write_container(path, &unlocked.container)?;
            unlocked.vault = Zeroizing::new(updated);
            vault_changed = true;
        }
        Ok((tick.reminders, vault_changed))
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

/// A fully verified backup, ready to become the live vault.
pub struct PreparedRestore {
    container: Container,
    dek: Key,
    vault: Zeroizing<Vec<u8>>,
    staged_files: std::path::PathBuf,
}

/// Verify a backup without touching the live vault: read it, derive its DEK with `derive`, decrypt the
/// body, and authenticate every file blob into a staging folder (spec §11). Nothing live is written
/// before this succeeds. Deliberately not a `Session` method: unpacking can take minutes, and holding
/// the session lock that long would freeze the app. Accepts both the archive format and a plain `.dat`
/// (older backups, whose blobs if any are in a sibling folder).
pub fn prepare_restore<F>(
    path: &Path,
    backup_path: &Path,
    derive: F,
    progress: Progress<'_>,
) -> Result<PreparedRestore>
where
    F: FnOnce(&Container) -> Result<Key>,
{
    let staged_files = blobs::staging_dir_for(path);
    // A crash during an earlier restore may have left a partial staging folder.
    blobs::remove_dir(&staged_files)?;
    std::fs::create_dir_all(&staged_files)?;

    let prepared = stage_backup(backup_path, &staged_files, derive, progress);
    if prepared.is_err() {
        let _ = blobs::remove_dir(&staged_files);
    }
    let (container, dek, vault) = prepared?;
    Ok(PreparedRestore {
        container,
        dek,
        vault,
        staged_files,
    })
}

fn stage_backup<F>(
    backup_path: &Path,
    staged_files: &Path,
    derive: F,
    progress: Progress<'_>,
) -> Result<(Container, Key, Zeroizing<Vec<u8>>)>
where
    F: FnOnce(&Container) -> Result<Key>,
{
    if archive::is_archive(backup_path)? {
        let opened = archive::open(backup_path)?;
        let container = opened.container.clone();
        let dek = derive(&container)?;
        let vault = envelope::decrypt_vault(&container, &dek)?;
        opened.extract_verified(&*crypto::derive_files_key(&dek)?, staged_files, progress)?;
        Ok((container, dek, vault))
    } else {
        let container = storage::read_container(backup_path)?;
        let dek = derive(&container)?;
        let vault = envelope::decrypt_vault(&container, &dek)?;
        blobs::link_verified(
            &*crypto::derive_files_key(&dek)?,
            &blobs::dir_for(backup_path),
            staged_files,
            progress,
        )?;
        Ok((container, dek, vault))
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
    use crate::container::SealedBlob;
    use crate::crypto::TEST_ARGON;
    use crate::storage::{unique_temp_dir, VAULT_FILE};
    use std::fs;

    fn session() -> Session {
        Session::new(Some(DEFAULT_AUTO_LOCK))
    }

    /// The production restore sequence, as `commands::restore_selected_vault` runs it.
    impl Session {
        fn restore_with<F>(
            &mut self,
            path: &Path,
            backup_path: &Path,
            pre_restore_file_name: &str,
            derive: F,
        ) -> Result<()>
        where
            F: FnOnce(&Container) -> Result<Key>,
        {
            let mut rejected = false;
            let prepared = prepare_restore(
                path,
                backup_path,
                |container| {
                    let key = derive(container);
                    rejected = key.is_err();
                    key
                },
                &mut blobs::no_progress(),
            );
            if rejected {
                self.record_restore_failure();
            }
            self.commit_restore(path, prepared?, pre_restore_file_name)
        }

        fn restore_password(
            &mut self,
            path: &Path,
            backup_path: &Path,
            password: &str,
            pre_restore_file_name: &str,
        ) -> Result<()> {
            self.restore_with(path, backup_path, pre_restore_file_name, |container| {
                envelope::unlock_with_password(container, password)
            })
        }

        fn restore_recovery(
            &mut self,
            path: &Path,
            backup_path: &Path,
            phrase: &str,
            pre_restore_file_name: &str,
        ) -> Result<()> {
            self.restore_with(path, backup_path, pre_restore_file_name, |container| {
                envelope::unlock_with_recovery(container, phrase)
            })
        }
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
    fn verified_change_requires_being_unlocked() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let mut s = session();
        assert!(matches!(
            s.change_master_verified(&path, "old pw", "new pw", TEST_ARGON),
            Err(Error::Locked)
        ));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn verified_change_refuses_a_wrong_current_password_and_changes_nothing() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let mut s = session();
        s.create(&path, "old pw", TEST_ARGON).unwrap();
        let before = fs::read(&path).unwrap();

        for _ in 0..4 {
            assert!(matches!(
                s.change_master_verified(&path, "wrong", "new pw", TEST_ARGON),
                Err(Error::Aead)
            ));
        }

        assert_eq!(fs::read(&path).unwrap(), before);
        assert!(s.is_unlocked());
        assert!(s.backoff_delay() > Duration::ZERO);

        // The right password clears the backoff and goes through.
        s.change_master_verified(&path, "old pw", "new pw", TEST_ARGON)
            .unwrap();
        assert_eq!(s.backoff_delay(), Duration::ZERO);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn verified_change_keeps_the_recovery_code_touch_id_wrap_and_files_working() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let mut s = session();
        let kit = s.create(&path, "old pw", TEST_ARGON).unwrap();
        s.save_vault(&path, r#"{"settings":{"theme":"light"}}"#)
            .unwrap();
        let id = add_file(&mut s, &path, b"keep me readable");
        let store_wrap = SealedBlob {
            nonce: crate::container::encode_bytes(&[9u8; crate::crypto::NONCE_LEN]),
            ct: crate::container::encode_bytes(&[9u8; 48]),
        };
        s.unlocked.as_mut().unwrap().container.wrapped_biometric = Some(store_wrap.clone());

        s.change_master_verified(&path, "old pw", "new pw", TEST_ARGON)
            .unwrap();

        // Still unlocked, and the on-disk vault no longer opens with the old password.
        assert!(s.is_unlocked());
        s.lock();
        assert!(s.unlock_password(&path, "old pw").is_err());
        s.unlock_password(&path, "new pw").unwrap();

        assert!(s.vault_json().unwrap().contains("light"));
        assert_eq!(read_file(&mut s, &path, &id), b"keep me readable");
        assert_eq!(
            storage::read_container(&path).unwrap().wrapped_biometric,
            Some(store_wrap)
        );

        s.lock();
        s.unlock_recovery(&path, &kit.recovery_code).unwrap();
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_backup_keeps_the_password_it_was_made_with() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let backup = dir.join("backup.okbak");
        let mut s = session();
        s.create(&path, "old pw", TEST_ARGON).unwrap();
        archive::write_archive(&path, &backup, &mut blobs::no_progress()).unwrap();

        s.change_master_verified(&path, "old pw", "new pw", TEST_ARGON)
            .unwrap();

        let opened = archive::open(&backup).unwrap();
        assert!(envelope::unlock_with_password(&opened.container, "old pw").is_ok());
        assert!(envelope::unlock_with_password(&opened.container, "new pw").is_err());
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
        assert_eq!(
            crate::storage::read_container(&path).unwrap().magic,
            crate::container::MAGIC
        );
        fs::remove_dir_all(&dir).ok();
    }

    /// Add a file to a vault through the session, as the Files module does. Returns its blob id.
    fn add_file(session: &mut Session, path: &Path, contents: &[u8]) -> String {
        let source = path.with_file_name("incoming-file");
        fs::write(&source, contents).unwrap();
        let key = session.files_key().unwrap();
        let (id, _) = blobs::import_file(
            &key,
            &blobs::dir_for(path),
            &source,
            &mut blobs::no_progress(),
        )
        .unwrap();
        id
    }

    fn read_file(session: &mut Session, path: &Path, id: &str) -> Vec<u8> {
        let key = session.files_key().unwrap();
        let dir = blobs::dir_for(path);
        let len = blobs::plain_len(&dir, id).unwrap();
        blobs::read_range(&key, &dir, id, 0, len).unwrap()
    }

    #[test]
    fn files_key_requires_unlocked_and_is_stable_across_a_password_change() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let mut s = session();
        assert!(matches!(s.files_key(), Err(Error::Locked)));

        s.create(&path, "master pw", TEST_ARGON).unwrap();
        let id = add_file(&mut s, &path, b"keep me readable");

        s.change_master(&path, "new master pw", TEST_ARGON).unwrap();
        s.lock();
        s.unlock_password(&path, "new master pw").unwrap();

        assert_eq!(read_file(&mut s, &path, &id), b"keep me readable");
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn touching_keeps_a_transfer_from_auto_locking() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let mut s = Session::new(Some(Duration::from_secs(60)));
        s.touch(); // locked: a no-op, since a locked vault can still be backed up
        s.create(&path, "pw", TEST_ARGON).unwrap();

        s.unlocked.as_mut().unwrap().last_activity = Instant::now() - Duration::from_secs(120);
        assert!(s.is_idle_expired(Instant::now()));
        s.touch();
        assert!(!s.is_idle_expired(Instant::now()));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn an_archive_restores_the_vault_and_its_files_under_the_backups_key() {
        let dir = unique_temp_dir();
        let active_path = dir.join(VAULT_FILE);
        let backup_vault = dir.join("source-vault.dat");
        let archive_path = dir.join("backup.okbak");
        let pre_restore = "ownkeep-pre-restore-20260707-1530.dat";

        let mut source = session();
        source
            .create(&backup_vault, "backup pw", TEST_ARGON)
            .unwrap();
        source
            .save_vault(&backup_vault, r#"{"settings":{"theme":"light"}}"#)
            .unwrap();
        let backed_up = add_file(&mut source, &backup_vault, b"from the backup");
        archive::write_archive(&backup_vault, &archive_path, &mut blobs::no_progress()).unwrap();

        let mut active = session();
        active
            .create(&active_path, "active pw", TEST_ARGON)
            .unwrap();
        let current = add_file(&mut active, &active_path, b"current file");

        active
            .restore_password(&active_path, &archive_path, "backup pw", pre_restore)
            .unwrap();

        assert!(active.vault_json().unwrap().contains("light"));
        assert_eq!(
            read_file(&mut active, &active_path, &backed_up),
            b"from the backup"
        );
        // The current file left the live folder but survives in the pre-restore snapshot.
        let live = blobs::list(&blobs::dir_for(&active_path)).unwrap();
        assert_eq!(live.len(), 1);
        let snapshot = dir.join(pre_restore);
        assert!(blobs::list(&blobs::dir_for(&snapshot))
            .unwrap()
            .iter()
            .any(|(id, _)| *id == current));
        assert!(!blobs::staging_dir_for(&active_path).exists());

        // The snapshot itself restores, files included, with the password it was taken under.
        active
            .restore_password(
                &active_path,
                &snapshot,
                "active pw",
                "ownkeep-pre-restore-20260707-1531.dat",
            )
            .unwrap();
        assert_eq!(
            read_file(&mut active, &active_path, &current),
            b"current file"
        );
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn an_old_plain_backup_restores_and_clears_the_current_files() {
        let dir = unique_temp_dir();
        let active_path = dir.join(VAULT_FILE);
        let backup_path = dir.join("ownkeep-v1.5-20260707-1530.dat");

        let mut old = session();
        old.create(&backup_path, "backup pw", TEST_ARGON).unwrap();

        let mut active = session();
        active
            .create(&active_path, "active pw", TEST_ARGON)
            .unwrap();
        add_file(&mut active, &active_path, b"current file");

        active
            .restore_password(
                &active_path,
                &backup_path,
                "backup pw",
                "ownkeep-pre-restore-20260707-1530.dat",
            )
            .unwrap();

        assert!(blobs::list(&blobs::dir_for(&active_path))
            .unwrap()
            .is_empty());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_wrong_password_leaves_the_archive_unpacked_and_counts_a_failure() {
        let dir = unique_temp_dir();
        let active_path = dir.join(VAULT_FILE);
        let backup_vault = dir.join("source-vault.dat");
        let archive_path = dir.join("backup.okbak");
        let pre_restore = "ownkeep-pre-restore-20260707-1530.dat";

        let mut source = session();
        source
            .create(&backup_vault, "backup pw", TEST_ARGON)
            .unwrap();
        add_file(&mut source, &backup_vault, b"from the backup");
        archive::write_archive(&backup_vault, &archive_path, &mut blobs::no_progress()).unwrap();

        let mut active = session();
        active
            .create(&active_path, "active pw", TEST_ARGON)
            .unwrap();
        let current = add_file(&mut active, &active_path, b"current file");

        for _ in 0..4 {
            assert!(active
                .restore_password(&active_path, &archive_path, "wrong", pre_restore)
                .is_err());
        }

        assert!(active.backoff_delay() > Duration::ZERO);
        assert!(!dir.join(pre_restore).exists());
        assert!(!blobs::staging_dir_for(&active_path).exists());
        assert_eq!(
            read_file(&mut active, &active_path, &current),
            b"current file"
        );
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_corrupt_file_in_the_archive_aborts_before_anything_live_changes() {
        let dir = unique_temp_dir();
        let active_path = dir.join(VAULT_FILE);
        let backup_vault = dir.join("source-vault.dat");
        let archive_path = dir.join("backup.okbak");
        let pre_restore = "ownkeep-pre-restore-20260707-1530.dat";

        let mut source = session();
        source
            .create(&backup_vault, "backup pw", TEST_ARGON)
            .unwrap();
        add_file(&mut source, &backup_vault, b"from the backup");
        archive::write_archive(&backup_vault, &archive_path, &mut blobs::no_progress()).unwrap();
        let mut bytes = fs::read(&archive_path).unwrap();
        let last = bytes.len() - 1;
        bytes[last] ^= 1;
        fs::write(&archive_path, bytes).unwrap();

        let mut active = session();
        active
            .create(&active_path, "active pw", TEST_ARGON)
            .unwrap();
        let current = add_file(&mut active, &active_path, b"current file");
        let before = fs::read(&active_path).unwrap();

        assert!(active
            .restore_password(&active_path, &archive_path, "backup pw", pre_restore)
            .is_err());

        assert_eq!(fs::read(&active_path).unwrap(), before);
        assert!(!dir.join(pre_restore).exists());
        assert!(!blobs::staging_dir_for(&active_path).exists());
        assert_eq!(
            read_file(&mut active, &active_path, &current),
            b"current file"
        );
        // A correct credential, so the failure isn't counted against the unlock backoff.
        assert_eq!(active.backoff_delay(), Duration::ZERO);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_stale_staging_folder_from_a_crash_is_discarded() {
        let dir = unique_temp_dir();
        let active_path = dir.join(VAULT_FILE);
        let backup_path = dir.join("ownkeep-v1.5-20260707-1530.dat");

        let mut old = session();
        old.create(&backup_path, "backup pw", TEST_ARGON).unwrap();

        let staging = blobs::staging_dir_for(&active_path);
        fs::create_dir_all(&staging).unwrap();
        fs::write(staging.join("leftover.blob"), b"junk").unwrap();

        let mut active = session();
        active
            .create(&active_path, "active pw", TEST_ARGON)
            .unwrap();
        active
            .restore_password(
                &active_path,
                &backup_path,
                "backup pw",
                "ownkeep-pre-restore-20260707-1530.dat",
            )
            .unwrap();

        assert!(blobs::list(&blobs::dir_for(&active_path))
            .unwrap()
            .is_empty());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn restore_refuses_wrong_password_before_replacing_or_snapshotting() {
        let dir = unique_temp_dir();
        let active_path = dir.join(VAULT_FILE);
        let backup_path = dir.join("ownkeep-v0.1-20260707-1530.dat");

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
                "ownkeep-pre-restore-20260707-1530.dat",
            )
            .is_err());

        assert_eq!(fs::read(&active_path).unwrap(), before);
        assert!(!dir.join("ownkeep-pre-restore-20260707-1530.dat").exists());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn restore_with_password_snapshots_replaces_and_unlocks_backup() {
        let dir = unique_temp_dir();
        let active_path = dir.join(VAULT_FILE);
        let backup_path = dir.join("ownkeep-v0.1-20260707-1530.dat");
        let pre_restore = "ownkeep-pre-restore-20260707-1530.dat";

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
        let backup_path = dir.join("ownkeep-v0.1-20260707-1530.dat");

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
                "ownkeep-pre-restore-20260707-1531.dat",
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
    fn biometric_unlock_uses_the_same_auto_lock_timeout_as_password_unlock() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let store = FakeBiometricKeyStore::available();
        let timeout = Duration::from_secs(5 * 60);
        let mut s = Session::new(Some(timeout));
        s.create(&path, "pw", TEST_ARGON).unwrap();
        s.enable_biometric(&path, &store).unwrap();

        s.lock();
        s.unlock_biometric(&path, &store).unwrap();

        let unlocked_at = s.unlocked.as_ref().unwrap().last_activity;
        assert!(!s.is_idle_expired(unlocked_at + timeout - Duration::from_secs(1)));
        assert!(s.is_idle_expired(unlocked_at + timeout));
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
    fn missing_biometric_key_falls_back_without_turning_status_into_a_prompt() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let store = FakeBiometricKeyStore::available();
        let mut s = session();
        s.create(&path, "pw", TEST_ARGON).unwrap();
        s.enable_biometric(&path, &store).unwrap();

        // Simulate macOS invalidating/removing the device-local item while its wrap remains in the
        // vault. Status stays non-prompting; explicit unlock discovers the stale key and falls back.
        store.delete_key().unwrap();
        assert!(biometric_status(&path, &store).enrolled);
        s.lock();
        assert!(matches!(
            s.unlock_biometric(&path, &store),
            Err(Error::BiometricNotEnrolled)
        ));
        assert!(!s.is_unlocked());

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
