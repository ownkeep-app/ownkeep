//! Encrypted file contents for the Files module (spec §3.2, §4.8).
//!
//! `vault.dat` is one JSON document re-sealed on every save, so user files of any size cannot live in
//! it. Each file is instead one immutable blob in a folder beside the vault, split into independently
//! sealed chunks: importing, exporting and backing up stream instead of loading the file, and a
//! preview decrypts only the chunks it asks for, which is what lets a long video seek.
//!
//! ```text
//! header (40 bytes): "OKBL" | version u8 | 3 zero bytes | chunk_len u32 | plain_len u64 | nonce_prefix [16]
//! chunks:            XChaCha20-Poly1305(chunk) | tag, for chunk 0..chunk_count
//! ```
//!
//! A chunk's nonce is `nonce_prefix || chunk_index`, and every chunk authenticates the blob id and the
//! header as associated data, so chunks cannot be reordered, truncated, or swapped between blobs. An
//! empty file still has one (empty) chunk, so its header is authenticated too.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

use chacha20poly1305::aead::{Aead, Payload};
use chacha20poly1305::{KeyInit, XChaCha20Poly1305, XNonce};

use crate::crypto::{self, KEY_LEN, NONCE_LEN};
use crate::error::{Error, Result};

const MAGIC: &[u8; 4] = b"OKBL";
const FORMAT_VERSION: u8 = 1;
/// Plaintext bytes per chunk: large enough that the 16-byte tag overhead is negligible, small enough
/// that a seek decrypts very little.
const CHUNK_LEN: u32 = 1 << 20;
/// Largest chunk size a blob header may declare, so a corrupt header cannot trigger a huge allocation.
const MAX_CHUNK_LEN: u32 = 64 << 20;
const TAG_LEN: u64 = 16;
const HEADER_LEN: usize = 40;
const NONCE_PREFIX_LEN: usize = 16;
const BLOB_EXTENSION: &str = "blob";
const MAX_ID_LEN: usize = 64;
const TEMP_SUFFIX: &str = ".tmp";

/// Told how many more bytes were processed; returning an error (e.g. [`Error::Canceled`]) aborts.
pub type Progress<'a> = &'a mut dyn FnMut(u64) -> Result<()>;

struct Header {
    chunk_len: u32,
    plain_len: u64,
    nonce_prefix: [u8; NONCE_PREFIX_LEN],
}

impl Header {
    fn to_bytes(&self) -> [u8; HEADER_LEN] {
        let mut bytes = [0u8; HEADER_LEN];
        bytes[..4].copy_from_slice(MAGIC);
        bytes[4] = FORMAT_VERSION;
        bytes[8..12].copy_from_slice(&self.chunk_len.to_le_bytes());
        bytes[12..20].copy_from_slice(&self.plain_len.to_le_bytes());
        bytes[20..36].copy_from_slice(&self.nonce_prefix);
        bytes
    }

    fn parse(bytes: &[u8; HEADER_LEN]) -> Result<Self> {
        if &bytes[..4] != MAGIC || bytes[4] != FORMAT_VERSION {
            return Err(Error::Format("unrecognized file blob".to_string()));
        }
        let chunk_len = u32::from_le_bytes(bytes[8..12].try_into().expect("4 bytes"));
        if chunk_len == 0 || chunk_len > MAX_CHUNK_LEN {
            return Err(Error::Format("invalid file blob chunk size".to_string()));
        }
        Ok(Self {
            chunk_len,
            plain_len: u64::from_le_bytes(bytes[12..20].try_into().expect("8 bytes")),
            nonce_prefix: bytes[20..36].try_into().expect("16 bytes"),
        })
    }

    fn chunk_count(&self) -> u64 {
        self.plain_len.div_ceil(u64::from(self.chunk_len)).max(1)
    }

    /// Plaintext length of chunk `index` (only the last chunk may be short).
    fn plain_chunk_len(&self, index: u64) -> usize {
        let start = index * u64::from(self.chunk_len);
        let remaining = self.plain_len.saturating_sub(start);
        remaining.min(u64::from(self.chunk_len)) as usize
    }
}

/// Seals and opens the chunks of one blob.
struct ChunkCipher {
    cipher: XChaCha20Poly1305,
    nonce_prefix: [u8; NONCE_PREFIX_LEN],
    aad: Vec<u8>,
}

impl ChunkCipher {
    fn new(key: &[u8; KEY_LEN], id: &str, header: &Header) -> Result<Self> {
        let mut aad = Vec::with_capacity(id.len() + HEADER_LEN);
        aad.extend_from_slice(id.as_bytes());
        aad.extend_from_slice(&header.to_bytes());
        Ok(Self {
            cipher: XChaCha20Poly1305::new_from_slice(key).map_err(|_| Error::Aead)?,
            nonce_prefix: header.nonce_prefix,
            aad,
        })
    }

    fn nonce(&self, index: u64) -> [u8; NONCE_LEN] {
        let mut nonce = [0u8; NONCE_LEN];
        nonce[..NONCE_PREFIX_LEN].copy_from_slice(&self.nonce_prefix);
        nonce[NONCE_PREFIX_LEN..].copy_from_slice(&index.to_le_bytes());
        nonce
    }

    fn seal(&self, index: u64, plain: &[u8]) -> Result<Vec<u8>> {
        self.cipher
            .encrypt(
                XNonce::from_slice(&self.nonce(index)),
                Payload {
                    msg: plain,
                    aad: &self.aad,
                },
            )
            .map_err(|_| Error::Aead)
    }

    fn open(&self, index: u64, sealed: &[u8]) -> Result<Vec<u8>> {
        self.cipher
            .decrypt(
                XNonce::from_slice(&self.nonce(index)),
                Payload {
                    msg: sealed,
                    aad: &self.aad,
                },
            )
            .map_err(|_| Error::Aead)
    }
}

/// The folder holding a vault's blobs: `vault.dat` → `vault.files`. Deriving it from the vault path
/// keeps debug and release data apart, and lets a `.dat` snapshot keep its blobs beside it.
pub fn dir_for(vault_path: &Path) -> PathBuf {
    vault_path.with_extension("files")
}

/// Where a restore unpacks and verifies blobs before swapping them in (same filesystem as the vault).
pub fn staging_dir_for(vault_path: &Path) -> PathBuf {
    vault_path.with_extension("files.restoring")
}

fn blob_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.{BLOB_EXTENSION}"))
}

/// A sibling path that blob listings ignore and interrupted writes can safely leave behind.
fn temp_path(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(TEMP_SUFFIX);
    PathBuf::from(name)
}

/// Blob ids become file names and can come from a backup or the WebView, so allow only a safe charset.
pub fn validate_id(id: &str) -> Result<()> {
    let safe = !id.is_empty()
        && id.len() <= MAX_ID_LEN
        && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-');
    if safe {
        Ok(())
    } else {
        Err(Error::Format("invalid file id".to_string()))
    }
}

/// A fresh random blob id.
pub fn new_id() -> Result<String> {
    let mut bytes = [0u8; 16];
    crypto::random_bytes(&mut bytes)?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

/// Read until `buf` is full or the source ends, without treating a short read as an error.
fn read_full<R: Read>(reader: &mut R, buf: &mut [u8]) -> io::Result<usize> {
    let mut filled = 0;
    while filled < buf.len() {
        match reader.read(&mut buf[filled..])? {
            0 => break,
            read => filled += read,
        }
    }
    Ok(filled)
}

fn read_header<R: Read>(reader: &mut R) -> Result<Header> {
    let mut bytes = [0u8; HEADER_LEN];
    reader.read_exact(&mut bytes)?;
    Header::parse(&bytes)
}

/// Encrypt exactly `plain_len` bytes of `reader` into `writer` as a blob.
fn encrypt_stream<R: Read, W: Write>(
    key: &[u8; KEY_LEN],
    id: &str,
    plain_len: u64,
    reader: &mut R,
    writer: &mut W,
    progress: Progress<'_>,
) -> Result<()> {
    let mut nonce_prefix = [0u8; NONCE_PREFIX_LEN];
    crypto::random_bytes(&mut nonce_prefix)?;
    let header = Header {
        chunk_len: CHUNK_LEN,
        plain_len,
        nonce_prefix,
    };
    let cipher = ChunkCipher::new(key, id, &header)?;
    writer.write_all(&header.to_bytes())?;

    let mut buffer = vec![0u8; CHUNK_LEN as usize];
    for index in 0..header.chunk_count() {
        let len = header.plain_chunk_len(index);
        if read_full(reader, &mut buffer[..len])? != len {
            return Err(Error::Format("file changed while importing".to_string()));
        }
        writer.write_all(&cipher.seal(index, &buffer[..len])?)?;
        progress(len as u64)?;
    }
    Ok(())
}

/// Read one sealed chunk of `index` into `buffer` (which must hold a full chunk plus tag).
fn read_sealed_chunk<'b, R: Read>(
    reader: &mut R,
    header: &Header,
    index: u64,
    buffer: &'b mut [u8],
) -> Result<&'b [u8]> {
    let sealed_len = header.plain_chunk_len(index) + TAG_LEN as usize;
    reader.read_exact(&mut buffer[..sealed_len])?;
    Ok(&buffer[..sealed_len])
}

fn chunk_buffer(header: &Header) -> Vec<u8> {
    vec![0u8; header.chunk_len as usize + TAG_LEN as usize]
}

/// Decrypt a whole blob from `reader` into `writer`, authenticating every chunk.
fn decrypt_stream<R: Read, W: Write>(
    key: &[u8; KEY_LEN],
    id: &str,
    reader: &mut R,
    writer: &mut W,
    progress: Progress<'_>,
) -> Result<()> {
    let header = read_header(reader)?;
    let cipher = ChunkCipher::new(key, id, &header)?;
    let mut buffer = chunk_buffer(&header);
    for index in 0..header.chunk_count() {
        let sealed = read_sealed_chunk(reader, &header, index, &mut buffer)?;
        let plain = cipher.open(index, sealed)?;
        writer.write_all(&plain)?;
        progress(plain.len() as u64)?;
    }
    Ok(())
}

/// Copy a blob as-is from `reader` to `writer`, authenticating every chunk on the way through. This
/// is a restore's "full decryption" gate (spec §11) without any re-encryption. Returns the bytes read.
pub fn verify_copy<R: Read, W: Write>(
    key: &[u8; KEY_LEN],
    id: &str,
    reader: &mut R,
    writer: &mut W,
    progress: Progress<'_>,
) -> Result<u64> {
    let header = read_header(reader)?;
    let cipher = ChunkCipher::new(key, id, &header)?;
    writer.write_all(&header.to_bytes())?;
    progress(HEADER_LEN as u64)?;
    let mut copied = HEADER_LEN as u64;
    let mut buffer = chunk_buffer(&header);
    for index in 0..header.chunk_count() {
        let sealed = read_sealed_chunk(reader, &header, index, &mut buffer)?;
        cipher.open(index, sealed)?;
        writer.write_all(sealed)?;
        progress(sealed.len() as u64)?;
        copied += sealed.len() as u64;
    }
    Ok(copied)
}

/// Run `write` against a temp file beside `path`, then fsync and atomically rename it into place. A
/// failed or canceled write leaves nothing behind.
pub fn write_file_atomic<F>(path: &Path, write: F) -> Result<()>
where
    F: FnOnce(&mut File) -> Result<()>,
{
    let tmp = temp_path(path);
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&tmp)?;
        write(&mut file)?;
        file.sync_all()?;
        fs::rename(&tmp, path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

/// Encrypt the file at `source` into a new blob and return its id and plaintext size.
pub fn import_file(
    key: &[u8; KEY_LEN],
    dir: &Path,
    source: &Path,
    progress: Progress<'_>,
) -> Result<(String, u64)> {
    fs::create_dir_all(dir)?;
    let id = new_id()?;
    let mut input = File::open(source)?;
    let size = input.metadata()?.len();
    write_file_atomic(&blob_path(dir, &id), |output| {
        encrypt_stream(key, &id, size, &mut input, output, progress)
    })?;
    Ok((id, size))
}

/// Decrypt a blob to `destination`. Plaintext appears there only once every chunk has authenticated.
pub fn export_file(
    key: &[u8; KEY_LEN],
    dir: &Path,
    id: &str,
    destination: &Path,
    progress: Progress<'_>,
) -> Result<()> {
    validate_id(id)?;
    let mut input = File::open(blob_path(dir, id))?;
    write_file_atomic(destination, |output| {
        decrypt_stream(key, id, &mut input, output, progress)
    })
}

/// Plaintext size of a blob, read from its header.
pub fn plain_len(dir: &Path, id: &str) -> Result<u64> {
    validate_id(id)?;
    Ok(read_header(&mut File::open(blob_path(dir, id))?)?.plain_len)
}

/// Decrypt `len` plaintext bytes starting at `start`, touching only the chunks that overlap them.
pub fn read_range(
    key: &[u8; KEY_LEN],
    dir: &Path,
    id: &str,
    start: u64,
    len: u64,
) -> Result<Vec<u8>> {
    validate_id(id)?;
    let mut file = File::open(blob_path(dir, id))?;
    let header = read_header(&mut file)?;
    let end = start
        .checked_add(len)
        .filter(|end| *end <= header.plain_len)
        .ok_or_else(|| Error::Format("file range out of bounds".to_string()))?;
    if len == 0 {
        return Ok(Vec::new());
    }

    let cipher = ChunkCipher::new(key, id, &header)?;
    let chunk_len = u64::from(header.chunk_len);
    let first = start / chunk_len;
    let last = (end - 1) / chunk_len;
    file.seek(SeekFrom::Start(
        HEADER_LEN as u64 + first * (chunk_len + TAG_LEN),
    ))?;

    let mut buffer = chunk_buffer(&header);
    let mut output = Vec::with_capacity(len as usize);
    for index in first..=last {
        let sealed = read_sealed_chunk(&mut file, &header, index, &mut buffer)?;
        let plain = cipher.open(index, sealed)?;
        let chunk_start = index * chunk_len;
        let from = start.saturating_sub(chunk_start) as usize;
        let to = (end - chunk_start).min(plain.len() as u64) as usize;
        output.extend_from_slice(&plain[from..to]);
    }
    Ok(output)
}

/// Every blob in `dir` as `(id, on-disk size)`, sorted by id. A missing folder simply has no blobs.
pub fn list(dir: &Path) -> Result<Vec<(String, u64)>> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e.into()),
    };
    let mut blobs = Vec::new();
    for entry in entries {
        let path = entry?.path();
        if path.extension().and_then(|e| e.to_str()) != Some(BLOB_EXTENSION) {
            continue;
        }
        let Some(id) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if validate_id(id).is_ok() {
            blobs.push((id.to_string(), fs::metadata(&path)?.len()));
        }
    }
    blobs.sort();
    Ok(blobs)
}

/// Delete a blob. Already gone is fine.
pub fn remove(dir: &Path, id: &str) -> Result<()> {
    validate_id(id)?;
    remove_if_exists(fs::remove_file(blob_path(dir, id)))
}

/// Delete a whole blob folder. Already gone is fine.
pub fn remove_dir(dir: &Path) -> Result<()> {
    remove_if_exists(fs::remove_dir_all(dir))
}

fn remove_if_exists(result: io::Result<()>) -> Result<()> {
    match result {
        Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e.into()),
        _ => Ok(()),
    }
}

/// Hard-link when possible: blobs are immutable, so a link costs no disk space and is instant. Fall
/// back to a copy across volumes.
fn link_or_copy(from: &Path, to: &Path) -> Result<()> {
    if fs::hard_link(from, to).is_err() {
        fs::copy(from, to)?;
    }
    Ok(())
}

/// Give a `.dat` snapshot its own view of the blobs at this moment, so restoring that snapshot later
/// finds them even after they are deleted from the live folder. Costs no extra disk until then.
pub fn snapshot_dir(from: &Path, to: &Path) -> Result<()> {
    let blobs = list(from)?;
    if blobs.is_empty() {
        return Ok(());
    }
    fs::create_dir_all(to)?;
    for (id, _) in blobs {
        link_or_copy(&blob_path(from, &id), &blob_path(to, &id))?;
    }
    Ok(())
}

/// Authenticate each blob in `from` and link it into `to` (restoring a `.dat` that has a snapshot).
pub fn link_verified(
    key: &[u8; KEY_LEN],
    from: &Path,
    to: &Path,
    progress: Progress<'_>,
) -> Result<()> {
    for (id, _) in list(from)? {
        let source = blob_path(from, &id);
        verify_copy(
            key,
            &id,
            &mut File::open(&source)?,
            &mut io::sink(),
            progress,
        )?;
        link_or_copy(&source, &blob_path(to, &id))?;
    }
    Ok(())
}

/// Replace the live blob folder with a fully verified staged one.
pub fn replace_dir(staged: &Path, live: &Path) -> Result<()> {
    remove_dir(live)?;
    fs::rename(staged, live)?;
    Ok(())
}

/// Save one blob from a backup archive into `dir`, authenticating every chunk. `reader` must be
/// limited to the blob's length.
pub fn store_verified<R: Read>(
    key: &[u8; KEY_LEN],
    dir: &Path,
    id: &str,
    expected_len: u64,
    reader: &mut R,
    progress: Progress<'_>,
) -> Result<()> {
    write_file_atomic(&blob_path(dir, id), |output| {
        let copied = verify_copy(key, id, reader, output, progress)?;
        if copied == expected_len {
            Ok(())
        } else {
            Err(Error::Format(
                "backup file entry has trailing data".to_string(),
            ))
        }
    })
}

/// Open a blob for copying into a backup archive.
pub fn open_raw(dir: &Path, id: &str) -> Result<File> {
    Ok(File::open(blob_path(dir, id))?)
}

/// The content type a file is previewed with, from its name. Only formats the WebView can display are
/// listed: everything else is `application/octet-stream`, which is stored but never rendered.
pub fn mime_for_file_name(name: &str) -> &'static str {
    let extension = Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    PREVIEWABLE_TYPES
        .iter()
        .find(|(ext, _)| *ext == extension)
        .map_or(OPAQUE_MIME, |(_, mime)| mime)
}

/// Whether a content type may be served to the WebView (never `text/html` or anything scriptable).
pub fn is_previewable_mime(mime: &str) -> bool {
    PREVIEWABLE_TYPES.iter().any(|(_, known)| *known == mime)
}

const OPAQUE_MIME: &str = "application/octet-stream";

const PREVIEWABLE_TYPES: &[(&str, &str)] = &[
    ("pdf", "application/pdf"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("png", "image/png"),
    ("gif", "image/gif"),
    ("webp", "image/webp"),
    ("avif", "image/avif"),
    ("heic", "image/heic"),
    ("heif", "image/heif"),
    ("bmp", "image/bmp"),
    ("tif", "image/tiff"),
    ("tiff", "image/tiff"),
    ("ico", "image/x-icon"),
    ("svg", "image/svg+xml"),
    ("mp3", "audio/mpeg"),
    ("m4a", "audio/mp4"),
    ("aac", "audio/aac"),
    ("wav", "audio/wav"),
    ("flac", "audio/flac"),
    ("ogg", "audio/ogg"),
    ("oga", "audio/ogg"),
    ("opus", "audio/ogg"),
    ("mp4", "video/mp4"),
    ("m4v", "video/mp4"),
    ("mov", "video/quicktime"),
    ("webm", "video/webm"),
];

#[cfg(test)]
pub(crate) fn no_progress() -> impl FnMut(u64) -> Result<()> {
    |_| Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::unique_temp_dir;
    use proptest::prelude::*;
    use std::io::Cursor;

    const KEY: [u8; KEY_LEN] = [7u8; KEY_LEN];
    const CHUNK: usize = CHUNK_LEN as usize;

    fn sample(len: usize) -> Vec<u8> {
        (0..len).map(|i| (i % 251) as u8).collect()
    }

    fn encrypted(id: &str, plain: &[u8]) -> Vec<u8> {
        let mut out = Vec::new();
        encrypt_stream(
            &KEY,
            id,
            plain.len() as u64,
            &mut Cursor::new(plain),
            &mut out,
            &mut no_progress(),
        )
        .unwrap();
        out
    }

    fn decrypted(id: &str, blob: &[u8]) -> Result<Vec<u8>> {
        let mut out = Vec::new();
        decrypt_stream(
            &KEY,
            id,
            &mut Cursor::new(blob),
            &mut out,
            &mut no_progress(),
        )?;
        Ok(out)
    }

    /// A blob on disk with known contents, plus its folder.
    fn stored(plain: &[u8]) -> (PathBuf, String) {
        let dir = unique_temp_dir();
        let source = dir.join("source.bin");
        fs::write(&source, plain).unwrap();
        let blobs = dir.join("blobs");
        let (id, size) = import_file(&KEY, &blobs, &source, &mut no_progress()).unwrap();
        assert_eq!(size, plain.len() as u64);
        (blobs, id)
    }

    #[test]
    fn round_trips_at_chunk_boundaries() {
        for len in [0, 1, CHUNK - 1, CHUNK, CHUNK + 1, 3 * CHUNK + 5] {
            let plain = sample(len);
            assert_eq!(decrypted("a", &encrypted("a", &plain)).unwrap(), plain);
        }
    }

    #[test]
    fn stored_size_is_header_plus_one_tag_per_chunk() {
        assert_eq!(encrypted("a", &[]).len(), HEADER_LEN + 16);
        assert_eq!(
            encrypted("a", &sample(CHUNK)).len(),
            HEADER_LEN + CHUNK + 16
        );
        assert_eq!(
            encrypted("a", &sample(CHUNK + 1)).len(),
            HEADER_LEN + CHUNK + 1 + 32
        );
    }

    #[test]
    fn plaintext_never_appears_in_the_blob() {
        let plain = b"the quick brown fox jumps over the lazy dog".repeat(100);
        let blob = encrypted("a", &plain);
        assert!(!blob.windows(16).any(|window| window == &plain[..16]));
    }

    #[test]
    fn the_same_file_encrypts_differently_each_time() {
        let plain = sample(100);
        assert_ne!(encrypted("a", &plain), encrypted("a", &plain));
    }

    #[test]
    fn a_wrong_key_is_rejected() {
        let blob = encrypted("a", &sample(10));
        let wrong = [8u8; KEY_LEN];
        let result = decrypt_stream(
            &wrong,
            "a",
            &mut Cursor::new(&blob),
            &mut Vec::new(),
            &mut no_progress(),
        );
        assert!(matches!(result, Err(Error::Aead)));
    }

    #[test]
    fn a_blob_cannot_be_swapped_to_another_id() {
        let blob = encrypted("a", &sample(10));
        assert!(matches!(decrypted("b", &blob), Err(Error::Aead)));
    }

    #[test]
    fn tampering_with_a_chunk_is_rejected() {
        let mut blob = encrypted("a", &sample(10));
        blob[HEADER_LEN] ^= 1;
        assert!(matches!(decrypted("a", &blob), Err(Error::Aead)));
    }

    #[test]
    fn tampering_with_the_declared_length_is_rejected() {
        let mut blob = encrypted("a", &sample(CHUNK + 10));
        blob[12] = 5; // claim a much shorter file, which would silently truncate it
        assert!(decrypted("a", &blob).is_err());
    }

    #[test]
    fn an_empty_file_still_authenticates_its_header() {
        let mut blob = encrypted("a", &[]);
        blob[20] ^= 1;
        assert!(matches!(decrypted("a", &blob), Err(Error::Aead)));
    }

    #[test]
    fn reordered_chunks_are_rejected() {
        let mut blob = encrypted("a", &sample(2 * CHUNK));
        let sealed = CHUNK + TAG_LEN as usize;
        let (first, second) = blob[HEADER_LEN..].split_at_mut(sealed);
        first.swap_with_slice(&mut second[..sealed]);
        assert!(matches!(decrypted("a", &blob), Err(Error::Aead)));
    }

    #[test]
    fn a_truncated_blob_is_rejected() {
        let blob = encrypted("a", &sample(2 * CHUNK));
        assert!(decrypted("a", &blob[..blob.len() - 1]).is_err());
        assert!(decrypted("a", &blob[..10]).is_err());
    }

    #[test]
    fn a_bad_header_is_rejected_before_any_allocation() {
        let mut blob = encrypted("a", &sample(10));
        blob[0] = b'X';
        assert!(matches!(decrypted("a", &blob), Err(Error::Format(_))));

        let mut wrong_version = encrypted("a", &sample(10));
        wrong_version[4] = 99;
        assert!(matches!(
            decrypted("a", &wrong_version),
            Err(Error::Format(_))
        ));

        for chunk_len in [0u32, MAX_CHUNK_LEN + 1] {
            let mut huge = encrypted("a", &sample(10));
            huge[8..12].copy_from_slice(&chunk_len.to_le_bytes());
            assert!(matches!(decrypted("a", &huge), Err(Error::Format(_))));
        }
    }

    #[test]
    fn a_source_that_shrinks_mid_import_fails() {
        let mut out = Vec::new();
        let result = encrypt_stream(
            &KEY,
            "a",
            100,
            &mut Cursor::new(vec![0u8; 10]),
            &mut out,
            &mut no_progress(),
        );
        assert!(matches!(result, Err(Error::Format(_))));
    }

    #[test]
    fn import_then_export_round_trips_without_temp_files() {
        let plain = sample(CHUNK + 123);
        let (blobs, id) = stored(&plain);
        let destination = blobs.parent().unwrap().join("out.bin");

        export_file(&KEY, &blobs, &id, &destination, &mut no_progress()).unwrap();

        assert_eq!(fs::read(&destination).unwrap(), plain);
        assert_eq!(plain_len(&blobs, &id).unwrap(), plain.len() as u64);
        assert_eq!(fs::read_dir(&blobs).unwrap().count(), 1);
    }

    #[test]
    fn progress_reports_every_byte_and_can_cancel() {
        let dir = unique_temp_dir();
        let source = dir.join("source.bin");
        fs::write(&source, sample(2 * CHUNK + 1)).unwrap();
        let blobs = dir.join("blobs");

        let mut seen = 0;
        import_file(&KEY, &blobs, &source, &mut |n| {
            seen += n;
            Ok(())
        })
        .unwrap();
        assert_eq!(seen, 2 * CHUNK as u64 + 1);

        let canceled = import_file(&KEY, &blobs, &source, &mut |_| Err(Error::Canceled));
        assert!(matches!(canceled, Err(Error::Canceled)));
        // The canceled import left neither a blob nor a temp file.
        assert_eq!(list(&blobs).unwrap().len(), 1);
        assert_eq!(fs::read_dir(&blobs).unwrap().count(), 1);
    }

    #[test]
    fn a_failed_export_leaves_nothing_at_the_destination() {
        let (blobs, id) = stored(&sample(10));
        let wrong = [8u8; KEY_LEN];
        let destination = blobs.parent().unwrap().join("out.bin");

        assert!(export_file(&wrong, &blobs, &id, &destination, &mut no_progress()).is_err());
        assert!(!destination.exists());
        assert!(!temp_path(&destination).exists());
    }

    #[test]
    fn reads_ranges_within_and_across_chunks() {
        let plain = sample(3 * CHUNK + 7);
        let (blobs, id) = stored(&plain);
        let total = plain.len() as u64;
        for (start, len) in [
            (0, 1),
            (0, total),
            (5, 10),
            (CHUNK as u64 - 1, 2),
            (CHUNK as u64, CHUNK as u64),
            (CHUNK as u64 + 3, 2 * CHUNK as u64),
            (total - 1, 1),
            (total, 0),
        ] {
            let got = read_range(&KEY, &blobs, &id, start, len).unwrap();
            let (from, to) = (start as usize, (start + len) as usize);
            assert_eq!(got, plain[from..to], "range {start}+{len}");
        }
    }

    #[test]
    fn a_range_outside_the_file_is_refused() {
        let (blobs, id) = stored(&sample(10));
        assert!(read_range(&KEY, &blobs, &id, 5, 6).is_err());
        assert!(read_range(&KEY, &blobs, &id, u64::MAX, 2).is_err());
    }

    #[test]
    fn a_range_read_authenticates_its_chunk() {
        let (blobs, id) = stored(&sample(10));
        let wrong = [8u8; KEY_LEN];
        assert!(matches!(
            read_range(&wrong, &blobs, &id, 0, 5),
            Err(Error::Aead)
        ));
    }

    #[test]
    fn ids_that_could_escape_the_folder_are_refused() {
        for bad in ["", "../vault", "a/b", "a\\b", "a.blob", &"x".repeat(65)] {
            assert!(validate_id(bad).is_err(), "{bad:?}");
        }
        assert!(validate_id(&new_id().unwrap()).is_ok());
        let dir = unique_temp_dir();
        assert!(plain_len(&dir, "../x").is_err());
        assert!(remove(&dir, "../x").is_err());
        assert!(read_range(&KEY, &dir, "../x", 0, 0).is_err());
        assert!(export_file(&KEY, &dir, "../x", &dir.join("o"), &mut no_progress()).is_err());
    }

    #[test]
    fn listing_ignores_temp_and_foreign_files() {
        let (blobs, id) = stored(&sample(10));
        fs::write(blobs.join(".DS_Store"), b"x").unwrap();
        fs::write(blobs.join("partial.blob.tmp"), b"x").unwrap();
        fs::write(blobs.join("bad name.blob"), b"x").unwrap();

        let listed = list(&blobs).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].0, id);
        assert!(list(&blobs.join("missing")).unwrap().is_empty());
    }

    #[test]
    fn removal_is_idempotent() {
        let (blobs, id) = stored(&sample(10));
        remove(&blobs, &id).unwrap();
        remove(&blobs, &id).unwrap();
        assert!(list(&blobs).unwrap().is_empty());
        remove_dir(&blobs).unwrap();
        remove_dir(&blobs).unwrap();
        assert!(!blobs.exists());
    }

    #[test]
    fn folders_follow_the_vault_file_name() {
        assert_eq!(
            dir_for(Path::new("/a/vault-dev.dat")),
            Path::new("/a/vault-dev.files")
        );
        assert_eq!(
            dir_for(Path::new("/a/ownkeep-v1.6-20260101-1200.dat")),
            Path::new("/a/ownkeep-v1.6-20260101-1200.files")
        );
        assert_eq!(
            staging_dir_for(Path::new("/a/vault.dat")),
            Path::new("/a/vault.files.restoring")
        );
    }

    #[test]
    fn a_snapshot_survives_deleting_the_live_blob_without_using_more_disk() {
        use std::os::unix::fs::MetadataExt;

        let plain = sample(10);
        let (blobs, id) = stored(&plain);
        let snapshot = blobs.parent().unwrap().join("snapshot");

        snapshot_dir(&blobs, &snapshot).unwrap();
        // Same inode: a hard link, so the snapshot costs no extra space.
        assert_eq!(
            fs::metadata(blob_path(&blobs, &id)).unwrap().ino(),
            fs::metadata(blob_path(&snapshot, &id)).unwrap().ino()
        );

        remove(&blobs, &id).unwrap();
        assert_eq!(
            read_range(&KEY, &snapshot, &id, 0, 10).unwrap(),
            plain.as_slice()
        );
    }

    #[test]
    fn snapshotting_nothing_creates_nothing() {
        let dir = unique_temp_dir();
        let snapshot = dir.join("snapshot");
        snapshot_dir(&dir.join("missing"), &snapshot).unwrap();
        assert!(!snapshot.exists());
    }

    #[test]
    fn link_verified_links_good_blobs_and_refuses_corrupt_ones() {
        let (blobs, id) = stored(&sample(10));
        let staged = blobs.parent().unwrap().join("staged");
        fs::create_dir_all(&staged).unwrap();

        link_verified(&KEY, &blobs, &staged, &mut no_progress()).unwrap();
        assert_eq!(list(&staged).unwrap().len(), 1);

        let path = blob_path(&blobs, &id);
        let mut bytes = fs::read(&path).unwrap();
        bytes[HEADER_LEN] ^= 1;
        // Replace rather than edit in place: the staged hard link must not see this corruption.
        fs::remove_file(&path).unwrap();
        fs::write(&path, bytes).unwrap();
        let other = blobs.parent().unwrap().join("other");
        fs::create_dir_all(&other).unwrap();
        assert!(matches!(
            link_verified(&KEY, &blobs, &other, &mut no_progress()),
            Err(Error::Aead)
        ));
        assert!(list(&other).unwrap().is_empty());
    }

    #[test]
    fn verify_copy_passes_good_blobs_through_unchanged() {
        let blob = encrypted("a", &sample(CHUNK + 1));
        let mut out = Vec::new();
        let copied = verify_copy(
            &KEY,
            "a",
            &mut Cursor::new(&blob),
            &mut out,
            &mut no_progress(),
        )
        .unwrap();
        assert_eq!(out, blob);
        assert_eq!(copied, blob.len() as u64);
    }

    #[test]
    fn store_verified_refuses_a_length_mismatch_and_cleans_up() {
        let blob = encrypted("a", &sample(10));
        let dir = unique_temp_dir();

        store_verified(
            &KEY,
            &dir,
            "a",
            blob.len() as u64,
            &mut Cursor::new(&blob),
            &mut no_progress(),
        )
        .unwrap();
        assert_eq!(list(&dir).unwrap().len(), 1);

        let result = store_verified(
            &KEY,
            &dir,
            "b",
            blob.len() as u64 + 1,
            &mut Cursor::new(&blob),
            &mut no_progress(),
        );
        assert!(result.is_err());
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
    }

    #[test]
    fn replace_dir_swaps_the_folder_contents() {
        let dir = unique_temp_dir();
        let (live, staged) = (dir.join("live"), dir.join("staged"));
        fs::create_dir_all(&live).unwrap();
        fs::write(live.join("old.blob"), b"old").unwrap();
        fs::create_dir_all(&staged).unwrap();
        fs::write(staged.join("new.blob"), b"new").unwrap();

        replace_dir(&staged, &live).unwrap();

        assert!(!staged.exists());
        assert!(!live.join("old.blob").exists());
        assert!(live.join("new.blob").exists());
    }

    #[test]
    fn content_types_come_from_the_file_extension() {
        assert_eq!(mime_for_file_name("a.PDF"), "application/pdf");
        assert_eq!(mime_for_file_name("song.mp3"), "audio/mpeg");
        assert_eq!(mime_for_file_name("clip.final.mp4"), "video/mp4");
        assert_eq!(mime_for_file_name("photo.JpEg"), "image/jpeg");
        assert_eq!(mime_for_file_name("page.html"), OPAQUE_MIME);
        assert_eq!(mime_for_file_name("archive.zip"), OPAQUE_MIME);
        assert_eq!(mime_for_file_name("no-extension"), OPAQUE_MIME);
    }

    #[test]
    fn only_displayable_types_are_previewable() {
        assert!(is_previewable_mime("application/pdf"));
        assert!(is_previewable_mime("video/mp4"));
        assert!(!is_previewable_mime("text/html"));
        assert!(!is_previewable_mime(OPAQUE_MIME));
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(16))]

        #[test]
        fn any_range_matches_the_plaintext(
            len in 0usize..(2 * CHUNK + 100),
            a in any::<u64>(),
            b in any::<u64>(),
        ) {
            let plain = sample(len);
            let blob = encrypted("a", &plain);
            prop_assert_eq!(decrypted("a", &blob).unwrap(), plain.clone());

            let dir = unique_temp_dir();
            fs::write(blob_path(&dir, "a"), &blob).unwrap();
            let start = a % (len as u64 + 1);
            let span = b % (len as u64 - start + 1);
            let got = read_range(&KEY, &dir, "a", start, span).unwrap();
            prop_assert_eq!(got, plain[start as usize..(start + span) as usize].to_vec());
            fs::remove_dir_all(&dir).ok();
        }
    }
}
