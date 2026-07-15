//! Shared error type for the OwnKeep vault core.
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
    /// The container was written by a newer OwnKeep than this build can read (spec §11.2 step 1).
    /// Surfaced to the frontend before unlock so an old build never touches a too-new vault.
    VaultTooNew,
    /// The recovery phrase was not a valid mnemonic.
    Recovery(String),
    /// Filesystem I/O failed.
    Io(std::io::Error),
    /// An operation required an unlocked vault, but none was loaded.
    Locked,
    /// Biometric unlock (Touch ID) was requested, but this vault has no biometric wrap enrolled.
    BiometricNotEnrolled,
    /// A biometric / Keychain operation failed (sensor unavailable, prompt denied/canceled, etc.).
    Biometric(String),
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
            Error::VaultTooNew => write!(
                f,
                "This vault was written by a newer OwnKeep. Please upgrade OwnKeep."
            ),
            Error::Recovery(m) => write!(f, "invalid recovery code: {m}"),
            Error::Io(e) => write!(f, "I/O error: {e}"),
            Error::Locked => write!(f, "vault is locked"),
            Error::BiometricNotEnrolled => write!(f, "Touch ID is not set up for this vault"),
            Error::Biometric(m) => write!(f, "biometric unlock failed: {m}"),
        }
    }
}

impl std::error::Error for Error {}

impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Error::Io(e)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_messages_are_stable() {
        assert_eq!(Error::Kdf.to_string(), "key derivation failed");
        assert!(Error::Aead.to_string().contains("authentication failed"));
        assert_eq!(Error::Rng.to_string(), "secure random generation failed");
        assert!(Error::Format("bad".to_string()).to_string().contains("bad"));
        assert!(Error::VaultTooNew.to_string().contains("newer OwnKeep"));
        assert!(Error::Recovery("oops".to_string())
            .to_string()
            .contains("oops"));
        assert_eq!(Error::Locked.to_string(), "vault is locked");
        assert!(Error::BiometricNotEnrolled.to_string().contains("Touch ID"));
        assert!(Error::Biometric("no sensor".to_string())
            .to_string()
            .contains("no sensor"));
    }

    #[test]
    fn converts_io_errors() {
        let err: Error = std::io::Error::new(std::io::ErrorKind::Other, "io").into();
        assert!(err.to_string().contains("I/O error"));
    }
}
