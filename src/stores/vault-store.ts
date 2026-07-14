/**
 * The vault store: the frontend's view of the (Rust-owned) vault, plus the unlock lifecycle.
 *
 * All secrets stay in Rust; this store holds the non-secret model projection and orchestrates the
 * Tauri commands via `@/vault/api`. Pure model transforms live in `@/vault/model` (unit-tested);
 * this store is the thin IPC/state-transition layer.
 */

import { create } from "zustand";

import { MODULES } from "@/modules/registry";
import { commandEntries } from "@/modules/commands/logic";
import {
  COMMANDS_MODULE_ID,
  type CommandEntry,
} from "@/modules/commands/types";
import { passwordEntries } from "@/modules/passwords/logic";
import {
  PASSWORDS_MODULE_ID,
  type PasswordEntry,
} from "@/modules/passwords/types";
import { subscriptionEntries } from "@/modules/subscriptions/logic";
import {
  SUBSCRIPTIONS_MODULE_ID,
  type SubscriptionEntry,
} from "@/modules/subscriptions/types";
import { financeSnapshots } from "@/modules/finance/logic";
import { FINANCE_MODULE_ID, type Snapshot } from "@/modules/finance/types";
import { todoEntries, toggleTodoDoneState } from "@/modules/todos/logic";
import { TODOS_MODULE_ID, type TodoEntry } from "@/modules/todos/types";
import { type BiometricStatus, type EmergencyKit, vaultApi } from "@/vault/api";
import {
  abandonedVaultBackupName,
  preMigrationBackupName,
  preRestoreBackupName,
  prepareVaultModel,
  vaultBackupName,
  VaultCompatibilityError,
  type MigrationPlan,
} from "@/vault/migrations";
import {
  ensureModuleDefaults,
  parseVaultJson,
  recordFrecency,
  setModuleEnabled,
  setModuleSearchable,
  setModuleSettings,
  withUpdatedAt,
  type VaultSettings,
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
type SettingsPatch = Partial<Omit<VaultSettings, "modules">>;

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
  unlockBiometric: () => Promise<void>;
  biometricStatus: () => Promise<BiometricStatus>;
  enableBiometric: () => Promise<void>;
  disableBiometric: () => Promise<void>;
  reenrollBiometric: () => Promise<void>;
  changeMaster: (newPassword: string) => Promise<void>;
  lock: () => Promise<void>;
  setAutoLock: (minutes: number) => Promise<void>;
  updateSettings: (patch: SettingsPatch) => Promise<void>;
  acceptMigration: () => Promise<void>;
  backupVault: () => Promise<string | null>;
  backupMigrationAndQuit: () => Promise<void>;
  restoreVaultWithPassword: (password: string) => Promise<string | null>;
  restoreVaultWithRecovery: (code: string) => Promise<string | null>;
  eraseVaultAndStartFresh: () => Promise<void>;
  /** Save a copy of the locked vault, then erase it and return to onboarding. */
  backupLockedVaultAndStartFresh: () => Promise<string | null>;
  quitApp: () => Promise<void>;
  save: (next: VaultModel) => Promise<void>;
  toggleModule: (id: string, enabled: boolean) => Promise<void>;
  toggleModuleSearchable: (id: string, searchable: boolean) => Promise<void>;
  recordUse: (id: string) => Promise<void>;
  savePassword: (entry: PasswordEntry) => Promise<void>;
  deletePassword: (id: string) => Promise<void>;
  saveCommand: (entry: CommandEntry) => Promise<void>;
  deleteCommand: (id: string) => Promise<void>;
  saveTodo: (entry: TodoEntry) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
  toggleTodoDone: (id: string) => Promise<void>;
  saveSubscription: (entry: SubscriptionEntry) => Promise<void>;
  deleteSubscription: (id: string) => Promise<void>;
  saveSnapshot: (entry: Snapshot) => Promise<void>;
  deleteSnapshot: (id: string) => Promise<void>;
  updateFinanceSettings: (patch: {
    baseCurrency?: string;
    fxRates?: Record<string, number>;
    holderOptions?: string[];
    categoryOptions?: string[];
  }) => Promise<void>;
  copySecret: (id: string, field: string) => Promise<void>;
  revealSecret: (id: string, field: string) => Promise<void>;
  regenerateRecovery: () => Promise<EmergencyKit>;
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
function syncRuntimeSettings(model: VaultModel): void {
  void vaultApi.setAutoLock(model.settings.autoLockMinutes);
  void vaultApi.setHotkeys(
    model.settings.globalHotkey,
    model.settings.dashboardHotkey,
  );
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
        syncRuntimeSettings(loaded.model);
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
      syncRuntimeSettings(model);
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
      syncRuntimeSettings(loaded.model);
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
      syncRuntimeSettings(loaded.model);
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

  unlockBiometric: async () => {
    // Unlock path C (spec §4.7): Touch ID releases the biometric KEK inside Rust. Mirrors `unlock`;
    // the master password and recovery code stay available if this is canceled or fails.
    set({ busy: true, error: null });
    try {
      await vaultApi.unlockBiometric();
      const loaded = await loadModel();
      syncRuntimeSettings(loaded.model);
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

  biometricStatus: async () => vaultApi.biometricStatus(),

  enableBiometric: async () => {
    await vaultApi.enableBiometric();
  },

  disableBiometric: async () => {
    await vaultApi.disableBiometric();
  },

  reenrollBiometric: async () => {
    await vaultApi.reenrollBiometric();
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

  updateSettings: async (patch) => {
    const model = get().model;
    if (!model) return;
    await get().save({
      ...model,
      settings: { ...model.settings, ...patch },
    });
    if (patch.autoLockMinutes !== undefined) {
      await vaultApi.setAutoLock(patch.autoLockMinutes);
    }
    if (
      patch.globalHotkey !== undefined ||
      patch.dashboardHotkey !== undefined
    ) {
      const nextSettings = { ...model.settings, ...patch };
      await vaultApi.setHotkeys(
        nextSettings.globalHotkey,
        nextSettings.dashboardHotkey,
      );
    }
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
      syncRuntimeSettings(stamped);
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

  backupVault: async () => {
    const model = get().model;
    if (!model) return null;

    set({ busy: true, error: null });
    try {
      return await vaultApi.backupVaultToChosenLocation(
        vaultBackupName(model.meta.appVersion, new Date()),
      );
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

  restoreVaultWithPassword: async (password) => {
    set({ busy: true, error: null });
    try {
      const restoredPath =
        await vaultApi.restoreVaultFromChosenLocationWithPassword(
          password,
          preRestoreBackupName(new Date()),
        );
      if (!restoredPath) return null;

      const loaded = await loadModel();
      syncRuntimeSettings(loaded.model);
      set({
        status: loaded.migration ? "migration" : "unlocked",
        model: loaded.model,
        migration: loaded.migration,
        postMigrationStatus: "unlocked",
        incompatibleMessage: null,
        pendingKit: null,
      });
      return restoredPath;
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
        return null;
      }
      set({ error: String(e) });
      throw e;
    } finally {
      set({ busy: false });
    }
  },

  restoreVaultWithRecovery: async (code) => {
    set({ busy: true, error: null });
    try {
      const restoredPath =
        await vaultApi.restoreVaultFromChosenLocationWithRecovery(
          code,
          preRestoreBackupName(new Date()),
        );
      if (!restoredPath) return null;

      const loaded = await loadModel();
      syncRuntimeSettings(loaded.model);
      set({
        status: loaded.migration ? "migration" : "unlocked",
        model: loaded.model,
        migration: loaded.migration,
        postMigrationStatus: "unlocked",
        incompatibleMessage: null,
        pendingKit: null,
      });
      return restoredPath;
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
        return null;
      }
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

  backupLockedVaultAndStartFresh: async () => {
    set({ busy: true, error: null });
    try {
      const backupPath = await vaultApi.backupVaultToChosenLocation(
        abandonedVaultBackupName(new Date()),
      );
      if (!backupPath) return null;

      await vaultApi.eraseVault();
      set({
        status: "onboarding",
        model: null,
        migration: null,
        incompatibleMessage: null,
        pendingKit: null,
      });
      return backupPath;
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

  toggleModuleSearchable: async (id, searchable) => {
    const model = get().model;
    if (!model) return;
    await get().save(setModuleSearchable(model, id, searchable));
  },

  recordUse: async (id) => {
    // Bump the item's frecency after a command-bar action so repeats rank higher (spec §7.2).
    const model = get().model;
    if (!model) return;
    await get().save(recordFrecency(model, id, now()));
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

  saveCommand: async (entry) => {
    const model = get().model;
    if (!model) return;
    const current = commandEntries(
      Array.isArray(model.modules[COMMANDS_MODULE_ID])
        ? model.modules[COMMANDS_MODULE_ID]
        : [],
    );
    const exists = current.some((item) => item.id === entry.id);
    const nextItems = exists
      ? current.map((item) => (item.id === entry.id ? entry : item))
      : [...current, entry];
    await saveThenReloadProjection(
      {
        ...model,
        modules: { ...model.modules, [COMMANDS_MODULE_ID]: nextItems },
      },
      set,
    );
  },

  deleteCommand: async (id) => {
    const model = get().model;
    if (!model) return;
    const current = commandEntries(
      Array.isArray(model.modules[COMMANDS_MODULE_ID])
        ? model.modules[COMMANDS_MODULE_ID]
        : [],
    );
    await saveThenReloadProjection(
      {
        ...model,
        modules: {
          ...model.modules,
          [COMMANDS_MODULE_ID]: current.filter((item) => item.id !== id),
        },
      },
      set,
    );
  },

  saveTodo: async (entry) => {
    const model = get().model;
    if (!model) return;
    const current = todoEntries(
      Array.isArray(model.modules[TODOS_MODULE_ID])
        ? model.modules[TODOS_MODULE_ID]
        : [],
    );
    const exists = current.some((item) => item.id === entry.id);
    const nextItems = exists
      ? current.map((item) => (item.id === entry.id ? entry : item))
      : [...current, entry];
    await saveThenReloadProjection(
      {
        ...model,
        modules: { ...model.modules, [TODOS_MODULE_ID]: nextItems },
      },
      set,
    );
  },

  deleteTodo: async (id) => {
    const model = get().model;
    if (!model) return;
    const current = todoEntries(
      Array.isArray(model.modules[TODOS_MODULE_ID])
        ? model.modules[TODOS_MODULE_ID]
        : [],
    );
    await saveThenReloadProjection(
      {
        ...model,
        modules: {
          ...model.modules,
          [TODOS_MODULE_ID]: current.filter((item) => item.id !== id),
        },
      },
      set,
    );
  },

  toggleTodoDone: async (id) => {
    const model = get().model;
    if (!model) return;
    const current = todoEntries(
      Array.isArray(model.modules[TODOS_MODULE_ID])
        ? model.modules[TODOS_MODULE_ID]
        : [],
    );
    const nextItems = current.map((item) =>
      item.id === id ? toggleTodoDoneState(item, now()) : item,
    );
    // Persist the toggled slice directly (no getVault round-trip) so the Dashboard checkbox
    // updates immediately; todos have no secret fields that need a redacted reload.
    await get().save({
      ...model,
      modules: { ...model.modules, [TODOS_MODULE_ID]: nextItems },
    });
  },

  saveSubscription: async (entry) => {
    const model = get().model;
    if (!model) return;
    const current = subscriptionEntries(
      Array.isArray(model.modules[SUBSCRIPTIONS_MODULE_ID])
        ? model.modules[SUBSCRIPTIONS_MODULE_ID]
        : [],
    );
    const exists = current.some((item) => item.id === entry.id);
    const nextItems = exists
      ? current.map((item) => (item.id === entry.id ? entry : item))
      : [...current, entry];
    await saveThenReloadProjection(
      {
        ...model,
        modules: { ...model.modules, [SUBSCRIPTIONS_MODULE_ID]: nextItems },
      },
      set,
    );
  },

  deleteSubscription: async (id) => {
    const model = get().model;
    if (!model) return;
    const current = subscriptionEntries(
      Array.isArray(model.modules[SUBSCRIPTIONS_MODULE_ID])
        ? model.modules[SUBSCRIPTIONS_MODULE_ID]
        : [],
    );
    await saveThenReloadProjection(
      {
        ...model,
        modules: {
          ...model.modules,
          [SUBSCRIPTIONS_MODULE_ID]: current.filter((item) => item.id !== id),
        },
      },
      set,
    );
  },

  saveSnapshot: async (entry) => {
    const model = get().model;
    if (!model) return;
    const current = financeSnapshots(
      Array.isArray(model.modules[FINANCE_MODULE_ID])
        ? model.modules[FINANCE_MODULE_ID]
        : [],
    );
    const exists = current.some((item) => item.id === entry.id);
    const nextItems = exists
      ? current.map((item) => (item.id === entry.id ? entry : item))
      : [...current, entry];
    await saveThenReloadProjection(
      {
        ...model,
        modules: { ...model.modules, [FINANCE_MODULE_ID]: nextItems },
      },
      set,
    );
  },

  deleteSnapshot: async (id) => {
    const model = get().model;
    if (!model) return;
    const current = financeSnapshots(
      Array.isArray(model.modules[FINANCE_MODULE_ID])
        ? model.modules[FINANCE_MODULE_ID]
        : [],
    );
    await saveThenReloadProjection(
      {
        ...model,
        modules: {
          ...model.modules,
          [FINANCE_MODULE_ID]: current.filter((item) => item.id !== id),
        },
      },
      set,
    );
  },

  updateFinanceSettings: async (patch) => {
    const model = get().model;
    if (!model) return;
    await get().save(setModuleSettings(model, FINANCE_MODULE_ID, patch));
  },

  copySecret: async (id, field) => {
    await vaultApi.copySecret(id, field);
  },

  revealSecret: async (id, field) => {
    await vaultApi.revealSecret(id, field);
  },

  regenerateRecovery: async () => {
    set({ busy: true, error: null });
    try {
      const kit = await vaultApi.regenerateRecovery();
      set({ pendingKit: kit });
      return kit;
    } catch (e) {
      set({ error: String(e) });
      throw e;
    } finally {
      set({ busy: false });
    }
  },

  dismissKit: () => set({ pendingKit: null }),
}));
