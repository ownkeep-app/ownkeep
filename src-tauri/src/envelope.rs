//! Envelope encryption (spec §4.1).
//!
//! A random **DEK** encrypts the vault body. The DEK is then *wrapped* twice — once by
//! `KEK_master` (Argon2id over the master password) and once by `KEK_recovery` (HKDF over the
//! recovery code) — so either path can unlock without the DEK ever being stored in the clear.
//!
//! Everything here is a pure function over a [`Container`] plus secret inputs: no file or network
//! I/O, so the whole envelope can be exhaustively unit- and property-tested.

use zeroize::Zeroizing;

use crate::container::{self, Container, KdfParams, RecoveryKdf, SealedBlob};
use crate::crypto::{self, Argon2Params, Key, Sealed, KEY_LEN};
use crate::error::{Error, Result};
use crate::recovery::{self, EmergencyKit};

/// The result of creating a fresh vault.
pub struct CreatedVault {
    /// The encrypted container, ready to persist.
    pub container: Container,
    /// The one-time Emergency Kit (recovery code) to show the user.
    pub emergency_kit: EmergencyKit,
    /// The DEK of the newly created (already unlocked) vault.
    pub dek: Key,
}

/// Create a brand-new vault: a random DEK seals `vault_plaintext`, then the DEK is wrapped by the
/// master password and by a freshly generated recovery code.
pub fn create_vault(
    password: &str,
    vault_plaintext: &[u8],
    argon: Argon2Params,
) -> Result<CreatedVault> {
    let dek = crypto::random_key()?;
    let vault = crypto::seal(&dek, vault_plaintext)?;

    // Wrap the DEK under the master-password KEK.
    let salt_master = crypto::random_salt()?;
    let kek_master = crypto::derive_kek_argon2id(password.as_bytes(), &salt_master, argon)?;
    let wrapped_master = crypto::seal(&kek_master, dek.as_slice())?;

    // Wrap the same DEK under a fresh recovery-code KEK.
    let code = recovery::generate()?;
    let salt_recovery = crypto::random_salt()?;
    let kek_recovery = crypto::derive_kek_hkdf(&code.entropy, &salt_recovery)?;
    let wrapped_recovery = crypto::seal(&kek_recovery, dek.as_slice())?;

    let container = Container {
        magic: container::MAGIC.to_string(),
        version: container::VERSION,
        kdf: KdfParams::argon2id(argon),
        recovery_kdf: RecoveryKdf::hkdf_sha256(),
        salt_master: container::encode_bytes(&salt_master),
        salt_recovery: container::encode_bytes(&salt_recovery),
        wrapped_master: SealedBlob::from_sealed(&wrapped_master),
        wrapped_recovery: SealedBlob::from_sealed(&wrapped_recovery),
        vault: SealedBlob::from_sealed(&vault),
    };

    let emergency_kit = EmergencyKit::new(&code.phrase);
    Ok(CreatedVault {
        container,
        emergency_kit,
        dek,
    })
}

/// Unlock path A: derive `KEK_master` from the password and unwrap the DEK.
pub fn unlock_with_password(container: &Container, password: &str) -> Result<Key> {
    let argon = container.kdf.to_argon2()?;
    let salt = container::decode_bytes(&container.salt_master)?;
    let kek = crypto::derive_kek_argon2id(password.as_bytes(), &salt, argon)?;
    unwrap_dek(&kek, &container.wrapped_master.to_sealed()?)
}

/// Unlock path B: derive `KEK_recovery` from the recovery phrase and unwrap the DEK.
pub fn unlock_with_recovery(container: &Container, phrase: &str) -> Result<Key> {
    let entropy = recovery::entropy_from_phrase(phrase)?;
    let salt = container::decode_bytes(&container.salt_recovery)?;
    let kek = crypto::derive_kek_hkdf(&entropy, &salt)?;
    unwrap_dek(&kek, &container.wrapped_recovery.to_sealed()?)
}

/// Decrypt the vault body with the DEK.
pub fn decrypt_vault(container: &Container, dek: &Key) -> Result<Zeroizing<Vec<u8>>> {
    crypto::open(dek, &container.vault.to_sealed()?)
}

/// Re-seal the vault body with the DEK after a mutation, replacing `container.vault`.
/// The DEK and both DEK-wraps are unchanged, so unlock (either path) still works.
pub fn reseal_vault(container: &mut Container, dek: &Key, vault_plaintext: &[u8]) -> Result<()> {
    let sealed = crypto::seal(dek, vault_plaintext)?;
    container.vault = SealedBlob::from_sealed(&sealed);
    Ok(())
}

/// Re-wrap the DEK under a new master password (fresh salt). Used for password changes and after a
/// recovery unlock (spec §4.1 path B). The DEK and the sealed vault body are unchanged.
pub fn set_master_password(
    container: &mut Container,
    dek: &Key,
    new_password: &str,
    argon: Argon2Params,
) -> Result<()> {
    let salt_master = crypto::random_salt()?;
    let kek = crypto::derive_kek_argon2id(new_password.as_bytes(), &salt_master, argon)?;
    let wrapped = crypto::seal(&kek, dek.as_slice())?;
    container.kdf = KdfParams::argon2id(argon);
    container.salt_master = container::encode_bytes(&salt_master);
    container.wrapped_master = SealedBlob::from_sealed(&wrapped);
    Ok(())
}

/// Regenerate the recovery code (fresh salt + fresh mnemonic), re-wrapping the same DEK. Returns
/// the new Emergency Kit; the previous recovery code stops working.
pub fn regenerate_recovery(container: &mut Container, dek: &Key) -> Result<EmergencyKit> {
    let code = recovery::generate()?;
    let salt_recovery = crypto::random_salt()?;
    let kek = crypto::derive_kek_hkdf(&code.entropy, &salt_recovery)?;
    let wrapped = crypto::seal(&kek, dek.as_slice())?;
    container.salt_recovery = container::encode_bytes(&salt_recovery);
    container.wrapped_recovery = SealedBlob::from_sealed(&wrapped);
    Ok(EmergencyKit::new(&code.phrase))
}

/// Unwrap a 32-byte DEK from a sealed blob, copying it straight into a zeroizing buffer.
fn unwrap_dek(kek: &Key, wrapped: &Sealed) -> Result<Key> {
    let bytes = crypto::open(kek, wrapped)?;
    if bytes.len() != KEY_LEN {
        return Err(Error::Aead);
    }
    let mut dek = Zeroizing::new([0u8; KEY_LEN]);
    dek.copy_from_slice(bytes.as_slice());
    Ok(dek)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::TEST_ARGON;

    const PLAINTEXT: &[u8] = br#"{"meta":{"schemaVersion":2}}"#;

    fn create() -> CreatedVault {
        create_vault("correct horse battery", PLAINTEXT, TEST_ARGON).unwrap()
    }

    #[test]
    fn unlock_with_password_recovers_the_vault() {
        let created = create();
        let dek = unlock_with_password(&created.container, "correct horse battery").unwrap();
        assert_eq!(&decrypt_vault(&created.container, &dek).unwrap()[..], PLAINTEXT);
    }

    #[test]
    fn both_unlock_paths_recover_the_same_dek() {
        let created = create();
        let by_pw = unlock_with_password(&created.container, "correct horse battery").unwrap();
        let by_rec =
            unlock_with_recovery(&created.container, &created.emergency_kit.recovery_code).unwrap();
        assert_eq!(by_pw[..], by_rec[..]);
        assert_eq!(&decrypt_vault(&created.container, &by_rec).unwrap()[..], PLAINTEXT);
    }

    #[test]
    fn wrong_password_is_rejected() {
        let created = create();
        assert!(matches!(
            unlock_with_password(&created.container, "wrong"),
            Err(Error::Aead)
        ));
    }

    #[test]
    fn wrong_but_valid_recovery_phrase_is_rejected() {
        let created = create();
        let other = recovery::generate().unwrap();
        assert!(matches!(
            unlock_with_recovery(&created.container, &other.phrase),
            Err(Error::Aead)
        ));
    }

    #[test]
    fn invalid_recovery_phrase_is_rejected() {
        let created = create();
        assert!(matches!(
            unlock_with_recovery(&created.container, "totally not a phrase"),
            Err(Error::Recovery(_))
        ));
    }

    #[test]
    fn tampered_vault_fails_to_decrypt() {
        let mut created = create();
        let mut sealed = created.container.vault.to_sealed().unwrap();
        sealed.ciphertext[0] ^= 0x01;
        created.container.vault = SealedBlob::from_sealed(&sealed);
        let dek = unlock_with_password(&created.container, "correct horse battery").unwrap();
        assert!(matches!(
            decrypt_vault(&created.container, &dek),
            Err(Error::Aead)
        ));
    }

    #[test]
    fn corrupting_a_serialized_byte_fails_cleanly() {
        let created = create();
        let bytes = created.container.to_bytes().unwrap();
        let mut container = Container::from_bytes(&bytes).unwrap();
        let mut sealed = container.vault.to_sealed().unwrap();
        sealed.ciphertext[1] ^= 0xFF;
        container.vault = SealedBlob::from_sealed(&sealed);
        let dek = unlock_with_password(&container, "correct horse battery").unwrap();
        assert!(matches!(decrypt_vault(&container, &dek), Err(Error::Aead)));
    }

    #[test]
    fn change_master_password_rewraps_dek() {
        let mut created = create();
        let dek_before = unlock_with_password(&created.container, "correct horse battery").unwrap();
        set_master_password(&mut created.container, &dek_before, "new passphrase", TEST_ARGON)
            .unwrap();

        assert!(matches!(
            unlock_with_password(&created.container, "correct horse battery"),
            Err(Error::Aead)
        ));
        let dek_after = unlock_with_password(&created.container, "new passphrase").unwrap();
        assert_eq!(dek_before[..], dek_after[..]);
        assert_eq!(
            &decrypt_vault(&created.container, &dek_after).unwrap()[..],
            PLAINTEXT
        );
        // Recovery path is untouched by a master-password change.
        assert!(
            unlock_with_recovery(&created.container, &created.emergency_kit.recovery_code).is_ok()
        );
    }

    #[test]
    fn recovery_then_set_new_master_password() {
        // Spec §4.1 path B: unlock via recovery, then force a new master password.
        let mut created = create();
        let dek =
            unlock_with_recovery(&created.container, &created.emergency_kit.recovery_code).unwrap();
        set_master_password(&mut created.container, &dek, "brand new master", TEST_ARGON).unwrap();
        let dek2 = unlock_with_password(&created.container, "brand new master").unwrap();
        assert_eq!(dek[..], dek2[..]);
    }

    #[test]
    fn regenerate_recovery_invalidates_old_code() {
        let mut created = create();
        let dek = unlock_with_password(&created.container, "correct horse battery").unwrap();
        let old_code = created.emergency_kit.recovery_code.clone();
        let new_kit = regenerate_recovery(&mut created.container, &dek).unwrap();

        assert_ne!(new_kit.recovery_code, old_code);
        assert!(matches!(
            unlock_with_recovery(&created.container, &old_code),
            Err(Error::Aead)
        ));
        let dek_new = unlock_with_recovery(&created.container, &new_kit.recovery_code).unwrap();
        assert_eq!(dek[..], dek_new[..]);
        assert!(unlock_with_password(&created.container, "correct horse battery").is_ok());
    }

    use proptest::prelude::*;

    proptest! {
        // Fewer cases: each runs Argon2 (test params) a few times.
        #![proptest_config(ProptestConfig::with_cases(32))]

        #[test]
        fn prop_both_paths_recover_same_dek_and_plaintext(
            password in "[a-zA-Z0-9!@#$ ]{1,32}",
            plaintext in proptest::collection::vec(any::<u8>(), 0..256),
        ) {
            let created = create_vault(&password, &plaintext, TEST_ARGON).unwrap();
            let by_pw = unlock_with_password(&created.container, &password).unwrap();
            let by_rec =
                unlock_with_recovery(&created.container, &created.emergency_kit.recovery_code)
                    .unwrap();
            prop_assert_eq!(&by_pw[..], &by_rec[..]);
            prop_assert_eq!(
                &decrypt_vault(&created.container, &by_pw).unwrap()[..],
                &plaintext[..]
            );
        }
    }
}
