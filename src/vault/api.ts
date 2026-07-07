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

export const vaultApi = {
  /** Whether a vault file exists (onboarding vs. unlock on launch). */
  vaultExists: () => invoke<boolean>("vault_exists"),
  isUnlocked: () => invoke<boolean>("is_unlocked"),
  /** Create a new vault; returns the recovery code to show once. */
  createVault: (password: string) =>
    invoke<EmergencyKit>("create_vault", { password }),
  unlock: (password: string) => invoke<void>("unlock", { password }),
  unlockRecovery: (code: string) => invoke<void>("unlock_recovery", { code }),
  lock: () => invoke<void>("lock"),
  changeMaster: (newPassword: string) =>
    invoke<void>("change_master", { newPassword }),
  regenerateRecovery: () => invoke<EmergencyKit>("regenerate_recovery"),
  /** The decrypted model as JSON (non-secret projection; redaction arrives with Phase 3). */
  getVault: () => invoke<string>("get_vault"),
  saveVault: (json: string) => invoke<void>("save_vault", { json }),
  backupVault: (fileName: string) =>
    invoke<string>("backup_vault", { fileName }),
  backupVaultToChosenLocation: (fileName: string) =>
    invoke<string | null>("backup_vault_to_chosen_location", { fileName }),
  eraseVault: () => invoke<void>("erase_vault"),
  quitApp: () => invoke<void>("quit_app"),
};

export type VaultApi = typeof vaultApi;
