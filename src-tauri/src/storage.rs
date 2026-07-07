//! Atomic on-disk persistence for the vault container (spec §3.2, §11).
//!
//! Every write goes to a temp file in the same directory, is `fsync`ed, then `rename`d over the
//! live file — so a crash mid-write can never leave a half-written (corrupt) vault. The directory
//! is fsynced too so the rename itself is durable.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::container::Container;
use crate::error::{Error, Result};

/// Production vault file name inside the app data directory.
pub const PROD_VAULT_FILE: &str = "vault.dat";
/// Development vault file name inside the app data directory.
pub const DEV_VAULT_FILE: &str = "vault-dev.dat";

/// Current vault file name inside the app data directory.
///
/// Debug builds (`tauri dev`, tests, local development) use a separate file so dev work cannot
/// accidentally read or mutate the production vault created by an installed release build. Release
/// builds use the production vault file.
pub const VAULT_FILE: &str = if cfg!(debug_assertions) {
    DEV_VAULT_FILE
} else {
    PROD_VAULT_FILE
};

/// Whether a vault file exists at `path`.
pub fn vault_exists(path: &Path) -> bool {
    path.exists()
}

/// Read and parse a container from disk.
pub fn read_container(path: &Path) -> Result<Container> {
    let bytes = fs::read(path)?;
    Container::from_bytes(&bytes)
}

/// Pre-unlock compatibility probe (spec §11.2 step 1): the incompatibility message if the on-disk
/// container is newer than this build can read, else `None`. A missing vault or any other read error
/// returns `None` — those are surfaced at unlock time, not here.
pub fn incompatibility_message(path: &Path) -> Option<String> {
    match read_container(path) {
        Err(Error::VaultTooNew) => Some(Error::VaultTooNew.to_string()),
        _ => None,
    }
}

/// Atomically persist a container to `path`.
pub fn write_container(path: &Path, container: &Container) -> Result<()> {
    let bytes = container.to_bytes()?;
    write_atomic(path, &bytes)
}

/// Copy the encrypted vault file to a sibling backup file and fsync the copy.
pub fn backup_vault_file(path: &Path, file_name: &str) -> Result<PathBuf> {
    validate_backup_file_name(file_name)?;
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    backup_vault_to_path(path, &dir.join(file_name))
}

/// Copy the encrypted vault file to an explicit backup destination and fsync the copy.
pub fn backup_vault_to_path(path: &Path, backup_path: &Path) -> Result<PathBuf> {
    let bytes = fs::read(path)?;
    write_atomic(backup_path, &bytes)?;
    if let Ok(file) = File::open(backup_path) {
        let _ = file.sync_all();
    }
    Ok(backup_path.to_path_buf())
}

/// Remove the active vault file. Missing files are already "fresh start" and are ignored.
pub fn remove_vault_file(path: &Path) -> Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}

pub fn validate_backup_file_name(file_name: &str) -> Result<()> {
    if file_name.is_empty()
        || file_name == "."
        || file_name == ".."
        || file_name.contains('/')
        || file_name.contains('\\')
    {
        return Err(Error::Format(
            "backup file name must be a plain file name".to_string(),
        ));
    }
    Ok(())
}

/// Atomically write `bytes` to `path`: temp file → fsync → rename, then fsync the directory.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(dir)?;
    let tmp = temp_path(path);

    {
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?; // flush data + metadata to disk before the rename
    }

    fs::rename(&tmp, path)?; // atomic replace on the same filesystem

    // Best-effort: fsync the directory so the rename entry is durable across a crash.
    if let Ok(dir_file) = File::open(dir) {
        let _ = dir_file.sync_all();
    }
    Ok(())
}

/// The sibling temp path for an atomic write (`vault.dat` -> `vault.dat.tmp`).
fn temp_path(path: &Path) -> PathBuf {
    let mut name = path
        .file_name()
        .map(|n| n.to_os_string())
        .unwrap_or_default();
    name.push(".tmp");
    path.with_file_name(name)
}

/// Create a fresh unique temporary directory (shared by the storage and session tests).
#[cfg(test)]
pub(crate) fn unique_temp_dir() -> PathBuf {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!("keystash-test-{}-{}", std::process::id(), n));
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::container::{KdfParams, RecoveryKdf, SealedBlob, MAGIC, VERSION};
    use crate::crypto::{Argon2Params, NONCE_LEN};

    fn sample() -> Container {
        Container {
            magic: MAGIC.to_string(),
            version: VERSION,
            kdf: KdfParams::argon2id(Argon2Params::PRODUCTION),
            recovery_kdf: RecoveryKdf::hkdf_sha256(),
            salt_master: crate::container::encode_bytes(&[1u8; 16]),
            salt_recovery: crate::container::encode_bytes(&[2u8; 16]),
            wrapped_master: SealedBlob {
                nonce: crate::container::encode_bytes(&[3u8; NONCE_LEN]),
                ct: crate::container::encode_bytes(&[4u8; 48]),
            },
            wrapped_recovery: SealedBlob {
                nonce: crate::container::encode_bytes(&[5u8; NONCE_LEN]),
                ct: crate::container::encode_bytes(&[6u8; 48]),
            },
            vault: SealedBlob {
                nonce: crate::container::encode_bytes(&[7u8; NONCE_LEN]),
                ct: crate::container::encode_bytes(&[8u8; 64]),
            },
        }
    }

    #[test]
    fn write_then_read_round_trips_and_leaves_no_temp() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        assert!(!vault_exists(&path));

        let container = sample();
        write_container(&path, &container).unwrap();

        assert!(vault_exists(&path));
        assert_eq!(read_container(&path).unwrap(), container);
        assert!(!dir.join(format!("{VAULT_FILE}.tmp")).exists());

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn write_overwrites_existing() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        write_container(&path, &sample()).unwrap();

        let mut updated = sample();
        updated.salt_master = crate::container::encode_bytes(&[9u8; 16]);
        write_container(&path, &updated).unwrap();

        assert_eq!(read_container(&path).unwrap(), updated);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reading_corrupt_file_fails_cleanly() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        fs::write(&path, b"not a container").unwrap();
        assert!(read_container(&path).is_err());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn backup_copies_the_encrypted_vault_file() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        fs::write(&path, b"encrypted bytes").unwrap();

        let backup = backup_vault_file(&path, "keystash-v0.1-20260707-1530.dat").unwrap();

        assert_eq!(backup.parent(), Some(dir.as_path()));
        assert_eq!(fs::read(backup).unwrap(), b"encrypted bytes");
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn backup_can_copy_to_an_explicit_destination() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        let destination = dir.join("chosen").join("keystash-v0.1-20260707-1530.dat");
        fs::write(&path, b"encrypted bytes").unwrap();

        let backup = backup_vault_to_path(&path, &destination).unwrap();

        assert_eq!(backup, destination);
        assert_eq!(fs::read(backup).unwrap(), b"encrypted bytes");
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn backup_rejects_path_like_names() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        fs::write(&path, b"encrypted bytes").unwrap();

        assert!(backup_vault_file(&path, "../vault.dat").is_err());
        assert!(backup_vault_file(&path, "nested/vault.dat").is_err());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn remove_vault_file_is_idempotent() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        fs::write(&path, b"encrypted bytes").unwrap();

        remove_vault_file(&path).unwrap();
        assert!(!path.exists());
        remove_vault_file(&path).unwrap();
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn backup_preserves_the_container_version_and_body() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        write_container(&path, &sample()).unwrap();

        let backup = backup_vault_file(&path, "keystash-v0.1-20260707-1530.dat").unwrap();

        // A backup is a byte copy of the encrypted container, so it round-trips unchanged —
        // `container.version` (and the sealed `meta.appVersion`/`meta.schemaVersion`) are preserved.
        let restored = read_container(&backup).unwrap();
        assert_eq!(restored.version, VERSION);
        assert_eq!(restored, sample());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn incompatibility_message_flags_only_newer_containers() {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        assert_eq!(incompatibility_message(&path), None); // absent → nothing to flag

        write_container(&path, &sample()).unwrap();
        assert_eq!(incompatibility_message(&path), None); // current version reads fine

        let mut newer = sample();
        newer.version = VERSION + 1;
        write_container(&path, &newer).unwrap();
        assert!(incompatibility_message(&path).is_some()); // newer → refused pre-unlock
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    #[cfg(debug_assertions)]
    fn debug_build_uses_development_vault_file() {
        assert_eq!(VAULT_FILE, DEV_VAULT_FILE);
        assert_eq!(VAULT_FILE, "vault-dev.dat");
    }

    #[test]
    #[cfg(not(debug_assertions))]
    fn release_build_uses_production_vault_file() {
        assert_eq!(VAULT_FILE, PROD_VAULT_FILE);
        assert_eq!(VAULT_FILE, "vault.dat");
    }
}
