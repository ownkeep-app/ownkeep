//! Shared error type for the keystash vault core.
//!
//! Deliberately coarse on the cryptographic path: wrong password, wrong recovery code, and
//! tampering all surface as [`Error::Aead`] so nothing about *why* a decrypt failed can leak.

use std::fmt;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug)]
pub enum Error {
    /// Key derivation (Argon2id / HKDF) failed — invalid parameters.
    Kdf,
    /// AEAD open failed: wrong password, wrong recovery code, or tampered ciphertext.
    Aead,
    /// The OS random number generator failed.
    Rng,
    /// Container could not be parsed / decoded (magic, version, base64, JSON).
    Format(String),
    /// The recovery phrase was not a valid mnemonic.
    Recovery(String),
    /// Filesystem I/O failed.
    Io(std::io::Error),
    /// An operation required an unlocked vault, but none was loaded.
    Locked,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Kdf => write!(f, "key derivation failed"),
            Error::Aead => write!(
                f,
                "authentication failed (wrong password/recovery code, or corrupted data)"
            ),
            Error::Rng => write!(f, "secure random generation failed"),
            Error::Format(m) => write!(f, "invalid vault container: {m}"),
            Error::Recovery(m) => write!(f, "invalid recovery code: {m}"),
            Error::Io(e) => write!(f, "I/O error: {e}"),
            Error::Locked => write!(f, "vault is locked"),
        }
    }
}

impl std::error::Error for Error {}

impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Error::Io(e)
    }
}
