/**
 * The vault store: the frontend's view of the (Rust-owned) vault, plus the unlock lifecycle.
 *
 * All secrets stay in Rust; this store holds the non-secret model projection and orchestrates the
 * Tauri commands via `@/vault/api`. Pure model transforms live in `@/vault/model` (unit-tested);
 * this store is the thin IPC/state-transition layer.
 */

import { create } from "zustand";

import { MODULES } from "@/modules/registry";
import { passwordEntries } from "@/modules/passwords/logic";
import {
  PASSWORDS_MODULE_ID,
  type PasswordEntry,
} from "@/modules/passwords/types";
import { type EmergencyKit, vaultApi } from "@/vault/api";
import {
  preMigrationBackupName,
  prepareVaultModel,
  vaultBackupName,
  VaultCompatibilityError,
  type MigrationPlan,
} from "@/vault/migrations";
import {
  ensureModuleDefaults,
  parseVaultJson,
  setModuleEnabled,
  withUpdatedAt,
  type VaultModel,
} from "@/vault/model";

export type VaultStatus =
  | "loading"
  | "onboarding"
  | "locked"
  | "unlocked"
  | "reset"
  | "migration"
  | "incompatible";

type PostMigrationStatus = "unlocked" | "reset";

interface VaultState {
  status: VaultStatus;
  model: VaultModel | null;
  migration: MigrationPlan | null;
  postMigrationStatus: PostMigrationStatus;
  incompatibleMessage: string | null;
  /** The one-time Emergency Kit to show after onboarding/regenerate (§4.6); null otherwise. */
  pendingKit: EmergencyKit | null;
  busy: boolean;
  error: string | null;

  init: () => Promise<void>;
  create: (password: string) => Promise<EmergencyKit>;
  unlock: (password: string) => Promise<void>;
  unlockRecovery: (code: string) => Promise<void>;
  changeMaster: (newPassword: string) => Promise<void>;
  lock: () => Promise<void>;
  setAutoLock: (minutes: number) => Promise<void>;
  acceptMigration: () => Promise<void>;
  backupMigrationAndQuit: () => Promise<void>;
  eraseVaultAndStartFresh: () => Promise<void>;
  quitApp: () => Promise<void>;
  save: (next: VaultModel) => Promise<void>;
  toggleModule: (id: string, enabled: boolean) => Promise<void>;
  savePassword: (entry: PasswordEntry) => Promise<void>;
  deletePassword: (id: string) => Promise<void>;
  copySecret: (id: string, field: string) => Promise<void>;
  revealSecret: (id: string, field: string) => Promise<void>;
  dismissKit: () => void;
}

const now = () => new Date().toISOString();

/** Load the model from Rust, hydrate defaults, and compute any pending migration. */
async function loadModel(): Promise<{
  model: VaultModel;
  migration: MigrationPlan | null;
}> {
  const json = await vaultApi.getVault();
  return prepareVaultModel(parseVaultJson(json, now()), MODULES);
}

/**
 * Push the vault's auto-lock preference to the Rust session so the idle timer matches the stored
 * setting (spec §4.3) — the session otherwise starts on its default timeout each launch. Fire-and-
 * forget: a failed sync only means the default timeout stays in effect, never a data problem.
 */
function syncAutoLock(model: VaultModel): void {
  void vaultApi.setAutoLock(model.settings.autoLockMinutes);
}

async function saveThenReloadProjection(
  next: VaultModel,
  set: (state: Partial<VaultState>) => void,
): Promise<void> {
  const stamped = withUpdatedAt(next, now());
  await vaultApi.saveVault(JSON.stringify(stamped));
  const loaded = await loadModel();
  set({ model: loaded.model, migration: loaded.migration });
}

export const useVaultStore = create<VaultState>((set, get) => ({
  status: "loading",
  model: null,
  migration: null,
  postMigrationStatus: "unlocked",
  incompatibleMessage: null,
  pendingKit: null,
  busy: false,
  error: null,

  init: async () => {
    try {
      if (await vaultApi.isUnlocked()) {
        const loaded = await loadModel();
        syncAutoLock(loaded.model);
        set({
          status: loaded.migration ? "migration" : "unlocked",
          model: loaded.model,
          migration: loaded.migration,
          postMigrationStatus: "unlocked",
          incompatibleMessage: null,
          error: null,
        });
      } else if (await vaultApi.vaultExists()) {
        // Pre-unlock check (spec §11.2 step 1): refuse a too-new container before the lock screen.
        const incompatibility = await vaultApi.vaultIncompatibility();
        set(
          incompatibility
            ? {
                status: "incompatible",
                model: null,
                migration: null,
                incompatibleMessage: incompatibility,
                error: null,
              }
            : {
                status: "locked",
                model: null,
                migration: null,
                incompatibleMessage: null,
                error: null,
              },
        );
      } else {
        set({
          status: "onboarding",
          model: null,
          migration: null,
          incompatibleMessage: null,
          error: null,
        });
      }
    } catch (e) {
      if (e instanceof VaultCompatibilityError) {
        await vaultApi.lock();
        set({
          status: "incompatible",
          model: null,
          migration: null,
          incompatibleMessage: e.message,
          error: null,
        });
        return;
      }
      set({ error: String(e) });
    }
  },

  create: async (password) => {
    set({ busy: true, error: null });
    try {
      const kit = await vaultApi.createVault(password);
      // Persist a default model immediately so settings exist right after onboarding.
      const model = ensureModuleDefaults(parseVaultJson("{}", now()), MODULES);
      await vaultApi.saveVault(JSON.stringify(model));
      syncAutoLock(model);
      set({
        status: "unlocked",
        model,
        migration: null,
        incompatibleMessage: null,
        pendingKit: kit,
      });
      return kit;
    } finally {
      set({ busy: false });
    }
  },

  unlock: async (password) => {
    set({ busy: true, error: null });
    try {
      await vaultApi.unlock(password);
      const loaded = await loadModel();
      syncAutoLock(loaded.model);
      set({
        status: loaded.migration ? "migration" : "unlocked",
        model: loaded.model,
        migration: loaded.migration,
        postMigrationStatus: "unlocked",
        incompatibleMessage: null,
      });
    } catch (e) {
      if (e instanceof VaultCompatibilityError) {
        await vaultApi.lock();
        set({
          status: "incompatible",
          model: null,
          migration: null,
          incompatibleMessage: e.message,
          error: null,
        });
        return;
      }
      set({ error: String(e) });
      throw e;
    } finally {
      set({ busy: false });
    }
  },

  unlockRecovery: async (code) => {
    set({ busy: true, error: null });
    try {
      await vaultApi.unlockRecovery(code);
      const loaded = await loadModel();
      syncAutoLock(loaded.model);
      // §4.1 path B: a recovery unlock forces the user to set a new master password next.
      set({
        status: loaded.migration ? "migration" : "reset",
        model: loaded.model,
        migration: loaded.migration,
        postMigrationStatus: "reset",
        incompatibleMessage: null,
      });
    } catch (e) {
      if (e instanceof VaultCompatibilityError) {
        await vaultApi.lock();
        set({
          status: "incompatible",
          model: null,
          migration: null,
          incompatibleMessage: e.message,
          error: null,
        });
        return;
      }
      set({ error: String(e) });
      throw e;
    } finally {
      set({ busy: false });
    }
  },

  changeMaster: async (newPassword) => {
    await vaultApi.changeMaster(newPassword);
    set({ status: "unlocked" });
  },

  lock: async () => {
    await vaultApi.lock();
    set({
      status: "locked",
      model: null,
      migration: null,
      incompatibleMessage: null,
      pendingKit: null,
      error: null,
    });
  },

  setAutoLock: async (minutes) => {
    const model = get().model;
    if (!model) return;
    // Persist the preference in the vault, then push it to the live Rust idle timer (spec §4.3/§9).
    await get().save({
      ...model,
      settings: { ...model.settings, autoLockMinutes: minutes },
    });
    await vaultApi.setAutoLock(minutes);
  },

  acceptMigration: async () => {
    const { migration, postMigrationStatus } = get();
    if (!migration) return;

    set({ busy: true, error: null });
    try {
      await vaultApi.backupVault(
        preMigrationBackupName(
          migration.fromAppVersion,
          migration.toAppVersion,
          new Date(),
        ),
      );
      const stamped = withUpdatedAt(migration.migratedModel, now());
      await vaultApi.saveVault(JSON.stringify(stamped));
      syncAutoLock(stamped);
      set({
        status: postMigrationStatus,
        model: stamped,
        migration: null,
        incompatibleMessage: null,
      });
    } catch (e) {
      set({ error: String(e) });
      throw e;
    } finally {
      set({ busy: false });
    }
  },

  backupMigrationAndQuit: async () => {
    const migration = get().migration;
    if (!migration) return;

    set({ busy: true, error: null });
    try {
      const backupPath = await vaultApi.backupVaultToChosenLocation(
        vaultBackupName(migration.fromAppVersion, new Date()),
      );
      if (backupPath) {
        await vaultApi.quitApp();
      }
    } catch (e) {
      set({ error: String(e) });
      throw e;
    } finally {
      set({ busy: false });
    }
  },

  eraseVaultAndStartFresh: async () => {
    set({ busy: true, error: null });
    try {
      await vaultApi.eraseVault();
      set({
        status: "onboarding",
        model: null,
        migration: null,
        incompatibleMessage: null,
        pendingKit: null,
      });
    } catch (e) {
      set({ error: String(e) });
      throw e;
    } finally {
      set({ busy: false });
    }
  },

  quitApp: async () => {
    await vaultApi.quitApp();
  },

  save: async (next) => {
    const stamped = withUpdatedAt(next, now());
    await vaultApi.saveVault(JSON.stringify(stamped));
    set({ model: stamped });
  },

  toggleModule: async (id, enabled) => {
    const model = get().model;
    if (!model) return;
    await get().save(setModuleEnabled(model, id, enabled));
  },

  savePassword: async (entry) => {
    const model = get().model;
    if (!model) return;
    const current = passwordEntries(
      Array.isArray(model.modules[PASSWORDS_MODULE_ID])
        ? model.modules[PASSWORDS_MODULE_ID]
        : [],
    );
    const exists = current.some((item) => item.id === entry.id);
    const nextItems = exists
      ? current.map((item) => (item.id === entry.id ? entry : item))
      : [...current, entry];
    await saveThenReloadProjection(
      {
        ...model,
        modules: { ...model.modules, [PASSWORDS_MODULE_ID]: nextItems },
      },
      set,
    );
  },

  deletePassword: async (id) => {
    const model = get().model;
    if (!model) return;
    const current = passwordEntries(
      Array.isArray(model.modules[PASSWORDS_MODULE_ID])
        ? model.modules[PASSWORDS_MODULE_ID]
        : [],
    );
    await saveThenReloadProjection(
      {
        ...model,
        modules: {
          ...model.modules,
          [PASSWORDS_MODULE_ID]: current.filter((item) => item.id !== id),
        },
      },
      set,
    );
  },

  copySecret: async (id, field) => {
    await vaultApi.copySecret(id, field);
  },

  revealSecret: async (id, field) => {
    await vaultApi.revealSecret(id, field);
  },

  dismissKit: () => set({ pendingKit: null }),
}));
