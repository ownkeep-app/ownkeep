//! The on-disk vault container (spec §4.2): a self-describing, versioned, AEAD-encrypted blob.
//!
//! This module is only about *shape and encoding* (serde + base64). The cryptographic operations
//! that populate it live in `envelope.rs`.

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};

use crate::crypto::{Argon2Params, Sealed, NONCE_LEN};
use crate::error::{Error, Result};

/// Magic marker identifying a keystash container.
pub const MAGIC: &str = "KSTH";
/// Current container schema version.
pub const VERSION: u32 = 2;

/// The full on-disk container. All binary fields are base64 in the JSON.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct Container {
    pub magic: String,
    pub version: u32,
    pub kdf: KdfParams,
    pub recovery_kdf: RecoveryKdf,
    pub salt_master: String,
    pub salt_recovery: String,
    pub wrapped_master: SealedBlob,
    pub wrapped_recovery: SealedBlob,
    pub vault: SealedBlob,
}

/// Argon2id parameters for the master-password KDF.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct KdfParams {
    pub alg: String,
    pub mem_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
}

/// Recovery-code KDF descriptor (the code is high-entropy, so a fast KDF is used).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct RecoveryKdf {
    pub alg: String,
}

/// A sealed blob as stored on disk: base64 nonce + base64 ciphertext (incl. auth tag).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct SealedBlob {
    pub nonce: String,
    pub ct: String,
}

impl KdfParams {
    pub fn argon2id(params: Argon2Params) -> Self {
        Self {
            alg: "argon2id".to_string(),
            mem_kib: params.mem_kib,
            iterations: params.iterations,
            parallelism: params.parallelism,
        }
    }

    pub fn to_argon2(&self) -> Result<Argon2Params> {
        if self.alg != "argon2id" {
            return Err(Error::Format(format!("unsupported kdf alg: {}", self.alg)));
        }
        Ok(Argon2Params {
            mem_kib: self.mem_kib,
            iterations: self.iterations,
            parallelism: self.parallelism,
        })
    }
}

impl RecoveryKdf {
    pub fn hkdf_sha256() -> Self {
        Self {
            alg: "hkdf-sha256".to_string(),
        }
    }
}

impl SealedBlob {
    pub fn from_sealed(sealed: &Sealed) -> Self {
        Self {
            nonce: STANDARD.encode(sealed.nonce),
            ct: STANDARD.encode(&sealed.ciphertext),
        }
    }

    pub fn to_sealed(&self) -> Result<Sealed> {
        let nonce_vec = STANDARD
            .decode(&self.nonce)
            .map_err(|e| Error::Format(format!("nonce base64: {e}")))?;
        let nonce: [u8; NONCE_LEN] = nonce_vec
            .try_into()
            .map_err(|_| Error::Format("nonce must be 24 bytes".to_string()))?;
        let ciphertext = STANDARD
            .decode(&self.ct)
            .map_err(|e| Error::Format(format!("ciphertext base64: {e}")))?;
        Ok(Sealed { nonce, ciphertext })
    }
}

/// Base64-encode a salt (or any bytes) for storage.
pub fn encode_bytes(bytes: &[u8]) -> String {
    STANDARD.encode(bytes)
}

/// Base64-decode a stored salt (or any bytes).
pub fn decode_bytes(s: &str) -> Result<Vec<u8>> {
    STANDARD
        .decode(s)
        .map_err(|e| Error::Format(format!("base64: {e}")))
}

impl Container {
    /// Serialize to pretty JSON bytes for on-disk storage.
    pub fn to_bytes(&self) -> Result<Vec<u8>> {
        serde_json::to_vec_pretty(self).map_err(|e| Error::Format(format!("serialize: {e}")))
    }

    /// Parse and validate a container from on-disk bytes.
    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        let container: Container =
            serde_json::from_slice(bytes).map_err(|e| Error::Format(format!("parse: {e}")))?;
        if container.magic != MAGIC {
            return Err(Error::Format(format!("bad magic: {:?}", container.magic)));
        }
        if container.version != VERSION {
            return Err(Error::Format(format!(
                "unsupported version: {}",
                container.version
            )));
        }
        Ok(container)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Container {
        Container {
            magic: MAGIC.to_string(),
            version: VERSION,
            kdf: KdfParams::argon2id(Argon2Params::PRODUCTION),
            recovery_kdf: RecoveryKdf::hkdf_sha256(),
            salt_master: encode_bytes(&[1u8; 16]),
            salt_recovery: encode_bytes(&[2u8; 16]),
            wrapped_master: SealedBlob {
                nonce: encode_bytes(&[3u8; NONCE_LEN]),
                ct: encode_bytes(&[4u8; 48]),
            },
            wrapped_recovery: SealedBlob {
                nonce: encode_bytes(&[5u8; NONCE_LEN]),
                ct: encode_bytes(&[6u8; 48]),
            },
            vault: SealedBlob {
                nonce: encode_bytes(&[7u8; NONCE_LEN]),
                ct: encode_bytes(&[8u8; 64]),
            },
        }
    }

    #[test]
    fn container_json_round_trip() {
        let container = sample();
        let bytes = container.to_bytes().unwrap();
        let parsed = Container::from_bytes(&bytes).unwrap();
        assert_eq!(container, parsed);
    }

    #[test]
    fn sealed_blob_round_trip() {
        let sealed = Sealed {
            nonce: [9u8; NONCE_LEN],
            ciphertext: vec![10, 11, 12, 13],
        };
        let blob = SealedBlob::from_sealed(&sealed);
        assert_eq!(blob.to_sealed().unwrap(), sealed);
    }

    #[test]
    fn kdf_params_round_trip() {
        let params = Argon2Params::PRODUCTION;
        assert_eq!(KdfParams::argon2id(params).to_argon2().unwrap(), params);
    }

    #[test]
    fn rejects_bad_magic() {
        let mut container = sample();
        container.magic = "XXXX".to_string();
        let bytes = container.to_bytes().unwrap();
        assert!(matches!(Container::from_bytes(&bytes), Err(Error::Format(_))));
    }

    #[test]
    fn rejects_unsupported_version() {
        let mut container = sample();
        container.version = 999;
        let bytes = container.to_bytes().unwrap();
        assert!(matches!(Container::from_bytes(&bytes), Err(Error::Format(_))));
    }

    #[test]
    fn rejects_bad_nonce_length() {
        let blob = SealedBlob {
            nonce: encode_bytes(&[0u8; 8]),
            ct: encode_bytes(&[0u8; 16]),
        };
        assert!(matches!(blob.to_sealed(), Err(Error::Format(_))));
    }
}
