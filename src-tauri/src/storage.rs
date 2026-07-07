//! Atomic on-disk persistence for the vault container (spec §3.2, §11).
//!
//! Every write goes to a temp file in the same directory, is `fsync`ed, then `rename`d over the
//! live file — so a crash mid-write can never leave a half-written (corrupt) vault. The directory
//! is fsynced too so the rename itself is durable.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::container::Container;
use crate::error::Result;

/// Default vault file name inside the app data directory.
pub const VAULT_FILE: &str = "vault.dat";

/// Whether a vault file exists at `path`.
pub fn vault_exists(path: &Path) -> bool {
    path.exists()
}

/// Read and parse a container from disk.
pub fn read_container(path: &Path) -> Result<Container> {
    let bytes = fs::read(path)?;
    Container::from_bytes(&bytes)
}

/// Atomically persist a container to `path`.
pub fn write_container(path: &Path, container: &Container) -> Result<()> {
    let bytes = container.to_bytes()?;
    write_atomic(path, &bytes)
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

/// The sibling temp path for an atomic write (`vault.dat` → `vault.dat.tmp`).
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
}
