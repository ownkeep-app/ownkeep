/**
 * The Tauri IPC boundary for the vault (spec §4).
 *
 * Every call into the Rust core goes through here so components/stores never touch `invoke`
 * directly — which keeps the UI testable (mock `@/vault/api`) and the surface auditable.
 */

import { invoke } from "@tauri-apps/api/core";

/** The one-time Emergency Kit returned by create/regenerate (§4.6). */
export interface EmergencyKit {
  app: string;
  recovery_code: string;
  instructions: string;
}

/** Touch ID availability + enrollment for the current vault (spec §4.7). */
export interface BiometricStatus {
  /** The sensor is present and a fingerprint is enrolled on this Mac. */
  available: boolean;
  /** This vault has Touch ID enrolled (container wrap + Keychain key both present). */
  enrolled: boolean;
}

export const vaultApi = {
  /** Whether a vault file exists (onboarding vs. unlock on launch). */
  vaultExists: () => invoke<boolean>("vault_exists"),
  /**
   * Pre-unlock compatibility check (spec §11.2 step 1): the incompatibility message if this build is
   * too old to read the on-disk container, else null. Checked at launch, before password entry.
   */
  vaultIncompatibility: () => invoke<string | null>("vault_incompatibility"),
  isUnlocked: () => invoke<boolean>("is_unlocked"),
  /** Create a new vault; returns the recovery code to show once. */
  createVault: (password: string) =>
    invoke<EmergencyKit>("create_vault", { password }),
  unlock: (password: string) => invoke<void>("unlock", { password }),
  unlockRecovery: (code: string) => invoke<void>("unlock_recovery", { code }),
  lock: () => invoke<void>("lock"),
  /** Update the idle auto-lock timeout in the Rust session (minutes; `0` = never). Spec §4.3/§9. */
  setAutoLock: (minutes: number) => invoke<void>("set_auto_lock", { minutes }),
  /** Apply the configured global/window hotkeys to the desktop shell. Spec §9/F9. */
  setHotkeys: (globalHotkey: string, dashboardHotkey: string) =>
    invoke<void>("set_hotkeys", { globalHotkey, dashboardHotkey }),
  changeMaster: (newPassword: string) =>
    invoke<void>("change_master", { newPassword }),
  regenerateRecovery: () => invoke<EmergencyKit>("regenerate_recovery"),
  /** Touch ID status: whether the sensor is available and this vault has it enrolled (§4.7). */
  biometricStatus: () => invoke<BiometricStatus>("biometric_status"),
  /** Enroll Touch ID unlock for this vault (requires unlocked). */
  enableBiometric: () => invoke<void>("enable_biometric_unlock"),
  /** Remove Touch ID unlock for this vault (requires unlocked). */
  disableBiometric: () => invoke<void>("disable_biometric_unlock"),
  /** Re-enroll ("update") Touch ID with a fresh key (requires unlocked). */
  reenrollBiometric: () => invoke<void>("reenroll_biometric_unlock"),
  /** Unlock via Touch ID (unlock path C, §4.7). */
  unlockBiometric: () => invoke<void>("unlock_biometric"),
  /** The decrypted model projection as JSON; registered secret fields are redacted by Rust. */
  getVault: () => invoke<string>("get_vault"),
  saveVault: (json: string) => invoke<void>("save_vault", { json }),
  /** Copy a secret directly inside Rust so plaintext never enters the frontend projection. */
  copySecret: (id: string, field: string) =>
    invoke<void>("copy_secret", { id, field }),
  /** Reveal a secret in a native Rust-owned dialog, never returning plaintext to JS. */
  revealSecret: (id: string, field: string) =>
    invoke<void>("reveal_secret", { id, field }),
  backupVault: (fileName: string) =>
    invoke<string>("backup_vault", { fileName }),
  backupVaultToChosenLocation: (fileName: string) =>
    invoke<string | null>("backup_vault_to_chosen_location", { fileName }),
  requestNotificationPermission: () =>
    invoke<string>("request_notification_permission"),
  sendNotification: (title: string, body?: string) =>
    invoke<void>("send_notification", { title, body }),
  restoreVaultFromChosenLocationWithPassword: (
    password: string,
    preRestoreFileName: string,
  ) =>
    invoke<string | null>("restore_vault_from_chosen_location_with_password", {
      password,
      preRestoreFileName,
    }),
  restoreVaultFromChosenLocationWithRecovery: (
    code: string,
    preRestoreFileName: string,
  ) =>
    invoke<string | null>("restore_vault_from_chosen_location_with_recovery", {
      code,
      preRestoreFileName,
    }),
  eraseVault: () => invoke<void>("erase_vault"),
  quitApp: () => invoke<void>("quit_app"),
};

export type VaultApi = typeof vaultApi;
