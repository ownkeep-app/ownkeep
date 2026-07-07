//! The unlocked-vault session.
//!
//! The decrypted model and the DEK live here in the Rust core — never in the WebView (spec §4.5).
//! Provides auto-lock (idle timeout, §4.3), zeroize-on-lock (the decrypted state drops and
//! zeroizes), and optional failed-attempt backoff.

use std::path::Path;
use std::time::{Duration, Instant};

use zeroize::Zeroizing;

use crate::container::Container;
use crate::crypto::{Argon2Params, Key};
use crate::envelope;
use crate::error::{Error, Result};
use crate::recovery::EmergencyKit;
use crate::storage;

/// Initial (empty) vault body for a freshly created vault. The structured model
/// (meta/settings/modules, spec §5) is built by the module registry in Phase 2; the crypto core
/// treats the body as opaque bytes.
const INITIAL_VAULT: &[u8] = b"{}";

/// Default auto-lock idle timeout (spec §4.3 default: 5 minutes).
pub const DEFAULT_AUTO_LOCK: Duration = Duration::from_secs(5 * 60);

/// Decrypted state held while the vault is unlocked. Every secret field zeroizes on drop.
struct UnlockedVault {
    container: Container,
    dek: Key,
    /// The decrypted vault model held in the Rust core (spec §3.2). It zeroizes on lock; the module
    /// registry reads it to serve non-secret projections in Phase 2 (hence not yet read here).
    #[allow(dead_code)]
    vault: Zeroizing<Vec<u8>>,
    last_activity: Instant,
}

/// The vault session: at most one unlocked vault plus lock/backoff bookkeeping.
pub struct Session {
    unlocked: Option<UnlockedVault>,
    auto_lock: Duration,
    failed_attempts: u32,
}

impl Session {
    pub fn new(auto_lock: Duration) -> Self {
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

    /// Whether the idle timeout has elapsed (used by the auto-lock task). A locked vault is never
    /// "expired".
    pub fn is_idle_expired(&self, now: Instant) -> bool {
        match &self.unlocked {
            Some(u) => now.saturating_duration_since(u.last_activity) >= self.auto_lock,
            None => false,
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
        Session::new(DEFAULT_AUTO_LOCK)
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

        let mut immediate = Session::new(Duration::ZERO);
        immediate.create(&path, "pw", TEST_ARGON).unwrap();
        assert!(immediate.is_idle_expired(Instant::now()));

        let mut patient = Session::new(Duration::from_secs(3600));
        patient.create(&path, "pw", TEST_ARGON).unwrap();
        assert!(!patient.is_idle_expired(Instant::now()));
        patient.lock();
        assert!(!patient.is_idle_expired(Instant::now())); // locked → never expired
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
}
