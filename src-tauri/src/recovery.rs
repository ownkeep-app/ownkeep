//! Recovery code (spec §4.6): a 128-bit secret rendered as a 12-word BIP39 mnemonic.
//!
//! The code is **never stored** — only the KEK it derives (via HKDF) wraps the DEK. On unlock the
//! user re-enters the phrase; BIP39's checksum catches transcription typos, and the phrase maps
//! back to the same entropy that seeds the recovery KEK.

use bip39::{Language, Mnemonic};
use serde::Serialize;
use zeroize::Zeroizing;

use crate::crypto;
use crate::error::{Error, Result};

/// Application name shown on the Emergency Kit.
pub const APP_NAME: &str = "keystash";
/// Entropy length for a 12-word mnemonic (128-bit).
pub const RECOVERY_ENTROPY_LEN: usize = 16;

/// A freshly generated recovery code: the 12-word phrase to show the user, plus the entropy used
/// to derive the recovery KEK. Both are zeroized on drop.
pub struct RecoveryCode {
    pub phrase: Zeroizing<String>,
    pub entropy: Zeroizing<Vec<u8>>,
}

/// Generate a new random 12-word recovery code.
pub fn generate() -> Result<RecoveryCode> {
    let mut entropy = Zeroizing::new([0u8; RECOVERY_ENTROPY_LEN]);
    crypto::random_bytes(entropy.as_mut_slice())?;
    let mnemonic = Mnemonic::from_entropy_in(Language::English, entropy.as_slice())
        .map_err(|e| Error::Recovery(e.to_string()))?;
    Ok(RecoveryCode {
        phrase: Zeroizing::new(mnemonic.to_string()),
        entropy: Zeroizing::new(entropy.to_vec()),
    })
}

/// Parse and validate a user-entered recovery phrase, returning its 128-bit entropy.
/// The BIP39 checksum rejects transcription typos.
pub fn entropy_from_phrase(phrase: &str) -> Result<Zeroizing<Vec<u8>>> {
    // BIP39 English words are lowercase ASCII; lowercase + trim the user's input so case/spacing
    // slips don't reject an otherwise-correct phrase (the checksum still guards the content).
    let normalized = phrase.trim().to_lowercase();
    let mnemonic = Mnemonic::parse_in_normalized(Language::English, &normalized)
        .map_err(|e| Error::Recovery(e.to_string()))?;
    let (buf, len) = mnemonic.to_entropy_array();
    Ok(Zeroizing::new(buf[..len].to_vec()))
}

/// The Emergency Kit shown once at setup (and regeneratable from Settings).
///
/// It intentionally carries the plaintext recovery code — the user must see it once to store it
/// safely. This is the single, deliberate exception to the "secrets never leave Rust" rule (§4.5);
/// the frontend displays it once and must not persist it. The creation date and printable framing
/// are added by the UI (§4.6).
#[derive(Serialize, Debug, Clone)]
pub struct EmergencyKit {
    pub app: String,
    pub recovery_code: String,
    pub instructions: String,
}

impl EmergencyKit {
    pub fn new(phrase: &str) -> Self {
        Self {
            app: APP_NAME.to_string(),
            recovery_code: phrase.to_string(),
            instructions:
                "Store this 12-word recovery code somewhere safe and offline (printed, or in \
                 another password manager) — never beside your vault file. It can unlock your \
                 entire vault WITHOUT your master password. keystash never stores it: if you lose \
                 both your master password and this code, your data cannot be recovered."
                    .to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_produces_twelve_words_and_128_bit_entropy() {
        let code = generate().unwrap();
        assert_eq!(code.phrase.split_whitespace().count(), 12);
        assert_eq!(code.entropy.len(), RECOVERY_ENTROPY_LEN);
    }

    #[test]
    fn phrase_round_trips_to_the_same_entropy() {
        let code = generate().unwrap();
        let recovered = entropy_from_phrase(&code.phrase).unwrap();
        assert_eq!(&recovered[..], &code.entropy[..]);
    }

    #[test]
    fn accepts_extra_whitespace_and_case() {
        let code = generate().unwrap();
        let messy = format!("  {}  ", code.phrase.to_uppercase());
        let recovered = entropy_from_phrase(&messy).unwrap();
        assert_eq!(&recovered[..], &code.entropy[..]);
    }

    #[test]
    fn rejects_non_wordlist_phrase() {
        assert!(matches!(
            entropy_from_phrase("clearly not a bip39 phrase whatsoever"),
            Err(Error::Recovery(_))
        ));
    }

    #[test]
    fn rejects_checksum_typo() {
        // Valid wordlist words but an invalid checksum (the valid all-"abandon" phrase ends "about").
        let bad = "abandon abandon abandon abandon abandon abandon \
                   abandon abandon abandon abandon abandon abandon";
        assert!(matches!(entropy_from_phrase(bad), Err(Error::Recovery(_))));
    }

    #[test]
    fn emergency_kit_carries_the_code() {
        let kit = EmergencyKit::new("alpha bravo charlie");
        assert_eq!(kit.recovery_code, "alpha bravo charlie");
        assert_eq!(kit.app, APP_NAME);
        assert!(!kit.instructions.is_empty());
    }
}
