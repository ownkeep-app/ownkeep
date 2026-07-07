//! Low-level cryptographic primitives: KDFs, AEAD, and secure randomness.
//!
//! Pure and side-effect-free (aside from reading the OS RNG) so they can be unit- and
//! property-tested without Tauri. Higher-level envelope logic lives in `envelope.rs`.

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::aead::Aead;
use chacha20poly1305::{KeyInit, XChaCha20Poly1305, XNonce};
use hkdf::Hkdf;
use sha2::Sha256;
use zeroize::Zeroizing;

use crate::error::{Error, Result};

/// Symmetric key length in bytes (256-bit) — used for the DEK and every KEK.
pub const KEY_LEN: usize = 32;
/// KDF salt length in bytes.
pub const SALT_LEN: usize = 16;
/// XChaCha20-Poly1305 nonce length in bytes (192-bit).
pub const NONCE_LEN: usize = 24;

/// A 256-bit key held in memory and zeroized on drop.
pub type Key = Zeroizing<[u8; KEY_LEN]>;

/// Argon2id cost parameters. Persisted in the container so unlock is reproducible.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Argon2Params {
    pub mem_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
}

impl Argon2Params {
    /// Spec §4.2 production defaults: 256 MiB / 3 passes / 4 lanes.
    pub const PRODUCTION: Self = Self {
        mem_kib: 262_144,
        iterations: 3,
        parallelism: 4,
    };
}

/// Fill `buf` with cryptographically secure random bytes from the OS.
pub fn random_bytes(buf: &mut [u8]) -> Result<()> {
    getrandom::getrandom(buf).map_err(|_| Error::Rng)
}

/// Generate a fresh random 256-bit key (e.g. the DEK), zeroized on drop.
pub fn random_key() -> Result<Key> {
    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    random_bytes(key.as_mut_slice())?;
    Ok(key)
}

/// Generate a fresh random KDF salt.
pub fn random_salt() -> Result<[u8; SALT_LEN]> {
    let mut salt = [0u8; SALT_LEN];
    random_bytes(&mut salt)?;
    Ok(salt)
}

/// Derive a 256-bit KEK from the human master password via Argon2id (slow, memory-hard).
pub fn derive_kek_argon2id(password: &[u8], salt: &[u8], params: Argon2Params) -> Result<Key> {
    let params = Params::new(
        params.mem_kib,
        params.iterations,
        params.parallelism,
        Some(KEY_LEN),
    )
    .map_err(|_| Error::Kdf)?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut kek = Zeroizing::new([0u8; KEY_LEN]);
    argon2
        .hash_password_into(password, salt, kek.as_mut_slice())
        .map_err(|_| Error::Kdf)?;
    Ok(kek)
}

/// Derive a 256-bit KEK from the already-high-entropy recovery secret via HKDF-SHA256 (fast).
pub fn derive_kek_hkdf(ikm: &[u8], salt: &[u8]) -> Result<Key> {
    let hk = Hkdf::<Sha256>::new(Some(salt), ikm);
    let mut kek = Zeroizing::new([0u8; KEY_LEN]);
    hk.expand(b"keystash recovery kek v1", kek.as_mut_slice())
        .map_err(|_| Error::Kdf)?;
    Ok(kek)
}

/// An XChaCha20-Poly1305 ciphertext (including the auth tag) together with its nonce.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Sealed {
    pub nonce: [u8; NONCE_LEN],
    pub ciphertext: Vec<u8>,
}

/// Encrypt `plaintext` under `key` with a fresh random nonce.
pub fn seal(key: &[u8; KEY_LEN], plaintext: &[u8]) -> Result<Sealed> {
    let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(|_| Error::Aead)?;
    let mut nonce = [0u8; NONCE_LEN];
    random_bytes(&mut nonce)?;
    let ciphertext = cipher
        .encrypt(XNonce::from_slice(&nonce), plaintext)
        .map_err(|_| Error::Aead)?;
    Ok(Sealed { nonce, ciphertext })
}

/// Decrypt a [`Sealed`] blob under `key`. Returns [`Error::Aead`] on a wrong key or any tampering.
pub fn open(key: &[u8; KEY_LEN], sealed: &Sealed) -> Result<Zeroizing<Vec<u8>>> {
    let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(|_| Error::Aead)?;
    let plaintext = cipher
        .decrypt(
            XNonce::from_slice(&sealed.nonce),
            sealed.ciphertext.as_ref(),
        )
        .map_err(|_| Error::Aead)?;
    Ok(Zeroizing::new(plaintext))
}

/// Lightweight Argon2 parameters for tests so Argon2 stays fast (production uses 256 MiB / 3 / 4).
#[cfg(test)]
pub(crate) const TEST_ARGON: Argon2Params = Argon2Params {
    mem_kib: 64,
    iterations: 1,
    parallelism: 1,
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seal_open_round_trip() {
        let key = random_key().unwrap();
        let sealed = seal(&key, b"hello keystash").unwrap();
        let opened = open(&key, &sealed).unwrap();
        assert_eq!(&opened[..], b"hello keystash");
    }

    #[test]
    fn open_with_wrong_key_fails() {
        let key = random_key().unwrap();
        let other = random_key().unwrap();
        let sealed = seal(&key, b"secret").unwrap();
        assert!(matches!(open(&other, &sealed), Err(Error::Aead)));
    }

    #[test]
    fn tampered_ciphertext_fails() {
        let key = random_key().unwrap();
        let mut sealed = seal(&key, b"secret").unwrap();
        sealed.ciphertext[0] ^= 0x01;
        assert!(matches!(open(&key, &sealed), Err(Error::Aead)));
    }

    #[test]
    fn argon2_is_deterministic_and_salt_sensitive() {
        let salt = random_salt().unwrap();
        let a = derive_kek_argon2id(b"pw", &salt, TEST_ARGON).unwrap();
        let b = derive_kek_argon2id(b"pw", &salt, TEST_ARGON).unwrap();
        assert_eq!(a[..], b[..]);

        let other_salt = random_salt().unwrap();
        let c = derive_kek_argon2id(b"pw", &other_salt, TEST_ARGON).unwrap();
        assert_ne!(a[..], c[..]);
    }

    #[test]
    fn hkdf_is_deterministic_and_salt_sensitive() {
        let salt = random_salt().unwrap();
        let a = derive_kek_hkdf(b"entropy", &salt).unwrap();
        let b = derive_kek_hkdf(b"entropy", &salt).unwrap();
        assert_eq!(a[..], b[..]);

        let other = random_salt().unwrap();
        let c = derive_kek_hkdf(b"entropy", &other).unwrap();
        assert_ne!(a[..], c[..]);
    }

    use proptest::prelude::*;

    proptest! {
        #[test]
        fn prop_seal_open_round_trip(pt in proptest::collection::vec(any::<u8>(), 0..1024)) {
            let key = random_key().unwrap();
            let sealed = seal(&key, &pt).unwrap();
            prop_assert_eq!(&open(&key, &sealed).unwrap()[..], &pt[..]);
        }

        #[test]
        fn prop_open_with_wrong_key_fails(pt in proptest::collection::vec(any::<u8>(), 0..256)) {
            let key = random_key().unwrap();
            let other = random_key().unwrap();
            let sealed = seal(&key, &pt).unwrap();
            prop_assert!(matches!(open(&other, &sealed), Err(Error::Aead)));
        }

        #[test]
        fn prop_argon2_is_deterministic(pw in proptest::collection::vec(any::<u8>(), 0..64)) {
            let salt = random_salt().unwrap();
            let a = derive_kek_argon2id(&pw, &salt, TEST_ARGON).unwrap();
            let b = derive_kek_argon2id(&pw, &salt, TEST_ARGON).unwrap();
            prop_assert_eq!(&a[..], &b[..]);
        }
    }
}
