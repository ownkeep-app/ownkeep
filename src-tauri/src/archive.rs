//! The single-file backup archive (spec §11): the vault container plus every encrypted file blob.
//!
//! ```text
//! "OWNKBAK1" | container_len u64 | container JSON | blob_count u64
//! repeated:    id_len u16 | id | blob_len u64 | blob bytes
//! ```
//!
//! Blobs are already encrypted, so a backup is a plain streamed copy: no re-encryption, no base64, and
//! nothing held in memory, so it takes about as long as copying the files. The framing itself is not
//! authenticated and needs no secret to write (a locked vault can still be backed up). Tampering is
//! caught on restore, because the container and each blob's chunks are AEAD-sealed and bound to their id.

use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};

use crate::blobs::{self, Progress};
use crate::container::Container;
use crate::crypto::KEY_LEN;
use crate::error::{Error, Result};
use crate::storage;

const MAGIC: &[u8; 8] = b"OWNKBAK1";
const COPY_BUFFER_LEN: usize = 1 << 20;

/// Whether the file at `path` is an archive rather than a plain `.dat` container (older backups and
/// automatic snapshots), judged by content because restore is filename-agnostic.
pub fn is_archive(path: &Path) -> Result<bool> {
    let mut magic = [0u8; MAGIC.len()];
    let mut file = File::open(path)?;
    let mut filled = 0;
    while filled < magic.len() {
        match file.read(&mut magic[filled..])? {
            0 => return Ok(false),
            read => filled += read,
        }
    }
    Ok(&magic == MAGIC)
}

/// Total bytes a backup of this vault will copy for its blobs (for progress reporting).
pub fn blob_bytes(vault_path: &Path) -> Result<u64> {
    Ok(blobs::list(&blobs::dir_for(vault_path))?
        .iter()
        .map(|(_, size)| size)
        .sum())
}

/// Stream the encrypted vault and all its blobs to `destination`, which appears only once complete.
/// The device-local Touch ID wrap never travels in a backup (spec §4.7).
pub fn write_archive(
    vault_path: &Path,
    destination: &Path,
    progress: Progress<'_>,
) -> Result<PathBuf> {
    let mut container = storage::read_container(vault_path)?;
    container.wrapped_biometric = None;
    let container_bytes = container.to_bytes()?;
    let dir = blobs::dir_for(vault_path);
    let entries = blobs::list(&dir)?;

    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    blobs::write_file_atomic(destination, |file| {
        let mut output = BufWriter::with_capacity(COPY_BUFFER_LEN, file);
        output.write_all(MAGIC)?;
        output.write_all(&(container_bytes.len() as u64).to_le_bytes())?;
        output.write_all(&container_bytes)?;
        output.write_all(&(entries.len() as u64).to_le_bytes())?;
        for (id, size) in &entries {
            output.write_all(&(id.len() as u16).to_le_bytes())?;
            output.write_all(id.as_bytes())?;
            output.write_all(&size.to_le_bytes())?;
            copy_exactly(
                &mut blobs::open_raw(&dir, id)?,
                &mut output,
                *size,
                progress,
            )?;
        }
        output.flush()?;
        Ok(())
    })?;
    Ok(destination.to_path_buf())
}

/// Copy exactly `len` bytes, so a blob that changed size can't silently corrupt the framing after it.
fn copy_exactly<R: Read, W: Write>(
    reader: &mut R,
    writer: &mut W,
    len: u64,
    progress: Progress<'_>,
) -> Result<()> {
    let mut buffer = vec![0u8; COPY_BUFFER_LEN];
    let mut remaining = len;
    while remaining > 0 {
        let want = remaining.min(COPY_BUFFER_LEN as u64) as usize;
        reader.read_exact(&mut buffer[..want])?;
        writer.write_all(&buffer[..want])?;
        remaining -= want as u64;
        progress(want as u64)?;
    }
    Ok(())
}

fn read_u64<R: Read>(reader: &mut R) -> Result<u64> {
    let mut bytes = [0u8; 8];
    reader.read_exact(&mut bytes)?;
    Ok(u64::from_le_bytes(bytes))
}

/// An opened archive, positioned at its blobs. Reading the container alone is cheap, so a wrong
/// password is refused before any blob is touched.
pub struct Archive {
    reader: BufReader<File>,
    pub container: Container,
    blob_count: u64,
    file_len: u64,
}

/// Open an archive and parse its container.
pub fn open(path: &Path) -> Result<Archive> {
    let file = File::open(path)?;
    let file_len = file.metadata()?.len();
    let mut reader = BufReader::with_capacity(COPY_BUFFER_LEN, file);

    let mut magic = [0u8; MAGIC.len()];
    reader.read_exact(&mut magic)?;
    if &magic != MAGIC {
        return Err(Error::Format("not an OwnKeep backup archive".to_string()));
    }

    let container_len = read_u64(&mut reader)?;
    if container_len > file_len {
        return Err(Error::Format("backup archive is truncated".to_string()));
    }
    let mut container_bytes = vec![0u8; container_len as usize];
    reader.read_exact(&mut container_bytes)?;
    let container = Container::from_bytes(&container_bytes)?;
    let blob_count = read_u64(&mut reader)?;

    Ok(Archive {
        reader,
        container,
        blob_count,
        file_len,
    })
}

impl Archive {
    /// Unpack every blob into `dir`, authenticating each chunk with `key` on the way through.
    pub fn extract_verified(
        mut self,
        key: &[u8; KEY_LEN],
        dir: &Path,
        progress: Progress<'_>,
    ) -> Result<()> {
        for _ in 0..self.blob_count {
            let mut id_len = [0u8; 2];
            self.reader.read_exact(&mut id_len)?;
            let mut id = vec![0u8; usize::from(u16::from_le_bytes(id_len))];
            self.reader.read_exact(&mut id)?;
            let id = String::from_utf8(id)
                .map_err(|_| Error::Format("invalid file id in backup".to_string()))?;
            // Ids come from an untrusted file and become file names: this is the path-traversal gate.
            blobs::validate_id(&id)?;

            let blob_len = read_u64(&mut self.reader)?;
            if blob_len > self.file_len {
                return Err(Error::Format("backup archive is truncated".to_string()));
            }
            blobs::store_verified(
                key,
                dir,
                &id,
                blob_len,
                &mut (&mut self.reader).take(blob_len),
                progress,
            )?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blobs::no_progress;
    use crate::container::{encode_bytes, KdfParams, RecoveryKdf, SealedBlob, VERSION};
    use crate::crypto::{Argon2Params, NONCE_LEN};
    use crate::storage::{unique_temp_dir, write_container, VAULT_FILE};

    const KEY: [u8; KEY_LEN] = [3u8; KEY_LEN];

    fn container() -> Container {
        let blob = |byte: u8, len: usize| SealedBlob {
            nonce: encode_bytes(&[byte; NONCE_LEN]),
            ct: encode_bytes(&vec![byte; len]),
        };
        Container {
            magic: crate::container::MAGIC.to_string(),
            version: VERSION,
            kdf: KdfParams::argon2id(Argon2Params::PRODUCTION),
            recovery_kdf: RecoveryKdf::hkdf_sha256(),
            salt_master: encode_bytes(&[1u8; 16]),
            salt_recovery: encode_bytes(&[2u8; 16]),
            wrapped_master: blob(3, 48),
            wrapped_recovery: blob(4, 48),
            wrapped_biometric: None,
            vault: blob(5, 64),
        }
    }

    /// A vault on disk with one blob per entry of `sizes`.
    fn vault_with_blobs(sizes: &[usize]) -> (PathBuf, Vec<String>) {
        let dir = unique_temp_dir();
        let path = dir.join(VAULT_FILE);
        write_container(&path, &container()).unwrap();
        let mut ids = Vec::new();
        for (index, size) in sizes.iter().enumerate() {
            let source = dir.join(format!("source-{index}"));
            fs::write(&source, vec![index as u8; *size]).unwrap();
            let (id, _) =
                blobs::import_file(&KEY, &blobs::dir_for(&path), &source, &mut no_progress())
                    .unwrap();
            ids.push(id);
        }
        (path, ids)
    }

    fn archived(sizes: &[usize]) -> (PathBuf, PathBuf, Vec<String>) {
        let (path, ids) = vault_with_blobs(sizes);
        let archive = path.with_file_name("backup.okbak");
        write_archive(&path, &archive, &mut no_progress()).unwrap();
        (path, archive, ids)
    }

    fn extract(archive: &Path, key: &[u8; KEY_LEN]) -> (Result<()>, PathBuf) {
        let out = archive.with_file_name("restored");
        fs::create_dir_all(&out).unwrap();
        let result =
            open(archive).and_then(|opened| opened.extract_verified(key, &out, &mut no_progress()));
        (result, out)
    }

    /// Byte offset where the blob entries start (just past `blob_count`).
    fn entries_offset(archive_bytes: &[u8]) -> usize {
        let container_len = u64::from_le_bytes(archive_bytes[8..16].try_into().unwrap()) as usize;
        8 + 8 + container_len + 8
    }

    #[test]
    fn round_trips_the_container_and_every_blob() {
        let (path, archive, ids) = archived(&[0, 10, (1 << 20) + 5]);
        assert!(is_archive(&archive).unwrap());

        let opened = open(&archive).unwrap();
        assert_eq!(opened.container, container());

        let (result, out) = extract(&archive, &KEY);
        result.unwrap();
        for (index, id) in ids.iter().enumerate() {
            let size = blobs::plain_len(&out, id).unwrap();
            assert_eq!(size, blobs::plain_len(&blobs::dir_for(&path), id).unwrap(),);
            assert_eq!(
                blobs::read_range(&KEY, &out, id, 0, size).unwrap(),
                vec![index as u8; size as usize]
            );
        }
    }

    #[test]
    fn a_vault_with_no_files_archives_cleanly() {
        let (_, archive, _) = archived(&[]);
        let (result, out) = extract(&archive, &KEY);
        result.unwrap();
        assert!(blobs::list(&out).unwrap().is_empty());
    }

    #[test]
    fn the_biometric_wrap_never_travels() {
        let (path, _) = vault_with_blobs(&[]);
        let mut enrolled = container();
        enrolled.wrapped_biometric = Some(SealedBlob {
            nonce: encode_bytes(&[9u8; NONCE_LEN]),
            ct: encode_bytes(&[9u8; 48]),
        });
        write_container(&path, &enrolled).unwrap();
        let archive = path.with_file_name("backup.okbak");
        write_archive(&path, &archive, &mut no_progress()).unwrap();
        assert_eq!(open(&archive).unwrap().container.wrapped_biometric, None);
    }

    #[test]
    fn backup_copies_ciphertext_and_reports_its_size() {
        let (path, archive, ids) = archived(&[1000]);
        let on_disk = fs::read(blobs::dir_for(&path).join(format!("{}.blob", ids[0]))).unwrap();
        let archive_bytes = fs::read(&archive).unwrap();
        assert!(archive_bytes
            .windows(on_disk.len())
            .any(|window| window == on_disk));
        assert_eq!(blob_bytes(&path).unwrap(), on_disk.len() as u64);

        let mut reported = 0;
        write_archive(&path, &archive, &mut |n| {
            reported += n;
            Ok(())
        })
        .unwrap();
        assert_eq!(reported, on_disk.len() as u64);
    }

    #[test]
    fn canceling_a_backup_leaves_no_file_and_keeps_any_previous_one() {
        let (path, ids) = vault_with_blobs(&[10]);
        assert_eq!(ids.len(), 1);
        let archive = path.with_file_name("backup.okbak");

        let canceled = write_archive(&path, &archive, &mut |_| Err(Error::Canceled));
        assert!(matches!(canceled, Err(Error::Canceled)));
        assert!(!archive.exists());

        fs::write(&archive, b"previous").unwrap();
        assert!(write_archive(&path, &archive, &mut |_| Err(Error::Canceled)).is_err());
        assert_eq!(fs::read(&archive).unwrap(), b"previous");
        assert!(!path.with_file_name("backup.okbak.tmp").exists());
    }

    #[test]
    fn plain_containers_and_short_files_are_not_archives() {
        let dir = unique_temp_dir();
        let plain = dir.join("old.dat");
        write_container(&plain, &container()).unwrap();
        assert!(!is_archive(&plain).unwrap());

        let short = dir.join("short.dat");
        fs::write(&short, b"OWN").unwrap();
        assert!(!is_archive(&short).unwrap());
        assert!(open(&short).is_err());
        assert!(open(&plain).is_err());
        assert!(is_archive(&dir.join("missing")).is_err());
    }

    #[test]
    fn a_wrong_key_refuses_the_blobs() {
        let (_, archive, _) = archived(&[10]);
        let (result, out) = extract(&archive, &[4u8; KEY_LEN]);
        assert!(matches!(result, Err(Error::Aead)));
        assert!(blobs::list(&out).unwrap().is_empty());
    }

    #[test]
    fn a_truncated_archive_is_refused_at_every_point() {
        let (_, archive, _) = archived(&[10]);
        let bytes = fs::read(&archive).unwrap();
        let entries = entries_offset(&bytes);
        for cut in [
            4,
            12,
            100,
            entries - 4,
            entries,
            entries + 1,
            entries + 40,
            bytes.len() - 1,
        ] {
            let truncated = archive.with_file_name(format!("cut-{cut}"));
            fs::write(&truncated, &bytes[..cut]).unwrap();
            let (result, _) = extract(&truncated, &KEY);
            assert!(result.is_err(), "cut at {cut}");
        }
    }

    #[test]
    fn a_container_longer_than_the_file_is_refused_before_allocating() {
        let (_, archive, _) = archived(&[]);
        let mut bytes = fs::read(&archive).unwrap();
        bytes[8..16].copy_from_slice(&u64::MAX.to_le_bytes());
        fs::write(&archive, &bytes).unwrap();
        assert!(matches!(open(&archive), Err(Error::Format(_))));
    }

    #[test]
    fn a_blob_longer_than_the_file_is_refused() {
        let (_, archive, ids) = archived(&[10]);
        let mut bytes = fs::read(&archive).unwrap();
        let length_at = entries_offset(&bytes) + 2 + ids[0].len();
        bytes[length_at..length_at + 8].copy_from_slice(&u64::MAX.to_le_bytes());
        fs::write(&archive, &bytes).unwrap();
        let (result, _) = extract(&archive, &KEY);
        assert!(matches!(result, Err(Error::Format(_))));
    }

    #[test]
    fn a_path_traversal_id_is_refused_before_writing() {
        let (_, archive, ids) = archived(&[10]);
        let mut bytes = fs::read(&archive).unwrap();
        // Same length as the real id, so only the id check can reject it.
        let id_at = entries_offset(&bytes) + 2;
        let evil = format!("../{}", "x".repeat(ids[0].len() - 3));
        bytes[id_at..id_at + ids[0].len()].copy_from_slice(evil.as_bytes());
        fs::write(&archive, &bytes).unwrap();

        let (result, out) = extract(&archive, &KEY);
        assert!(matches!(result, Err(Error::Format(_))));
        assert!(blobs::list(&out).unwrap().is_empty());
    }

    #[test]
    fn a_non_utf8_id_is_refused() {
        let (_, archive, _) = archived(&[10]);
        let mut bytes = fs::read(&archive).unwrap();
        let id_at = entries_offset(&bytes) + 2;
        bytes[id_at] = 0xff;
        fs::write(&archive, &bytes).unwrap();
        let (result, _) = extract(&archive, &KEY);
        assert!(matches!(result, Err(Error::Format(_))));
    }

    #[test]
    fn a_blob_renamed_inside_the_archive_is_refused() {
        let (_, archive, ids) = archived(&[10]);
        let mut bytes = fs::read(&archive).unwrap();
        let id_at = entries_offset(&bytes) + 2;
        let renamed = "f".repeat(ids[0].len());
        bytes[id_at..id_at + ids[0].len()].copy_from_slice(renamed.as_bytes());
        fs::write(&archive, &bytes).unwrap();
        let (result, _) = extract(&archive, &KEY);
        assert!(matches!(result, Err(Error::Aead)));
    }

    #[test]
    fn copying_fails_if_a_blob_is_shorter_than_listed() {
        // Writing fewer bytes than the framing promised would corrupt every entry after this one.
        let mut sink = Vec::new();
        let result = copy_exactly(
            &mut std::io::Cursor::new(vec![0u8; 3]),
            &mut sink,
            10,
            &mut no_progress(),
        );
        assert!(result.is_err());
    }
}
