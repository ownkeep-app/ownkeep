/**
 * The vault store: the frontend's view of the (Rust-owned) vault, plus the unlock lifecycle.
 *
 * All secrets stay in Rust; this store holds the non-secret model projection and orchestrates the
 * Tauri commands via `@/vault/api`. Pure model transforms live in `@/vault/model` (unit-tested);
 * this store is the thin IPC/state-transition layer.
 */

import { create } from "zustand";

import { MODULES } from "@/modules/registry";
import { type EmergencyKit, vaultApi } from "@/vault/api";
import {
  ensureModuleDefaults,
  parseVaultJson,
  setModuleEnabled,
  withUpdatedAt,
  type VaultModel,
} from "@/vault/model";

export type VaultStatus =
  "loading" | "onboarding" | "locked" | "unlocked" | "reset";

interface VaultState {
  status: VaultStatus;
  model: VaultModel | null;
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
  save: (next: VaultModel) => Promise<void>;
  toggleModule: (id: string, enabled: boolean) => Promise<void>;
  dismissKit: () => void;
}

const now = () => new Date().toISOString();

/** Load the model from Rust and hydrate it with any missing module defaults. */
async function loadModel(): Promise<VaultModel> {
  const json = await vaultApi.getVault();
  return ensureModuleDefaults(parseVaultJson(json, now()), MODULES);
}

export const useVaultStore = create<VaultState>((set, get) => ({
  status: "loading",
  model: null,
  pendingKit: null,
  busy: false,
  error: null,

  init: async () => {
    try {
      if (await vaultApi.isUnlocked()) {
        set({ status: "unlocked", model: await loadModel(), error: null });
      } else if (await vaultApi.vaultExists()) {
        set({ status: "locked", model: null, error: null });
      } else {
        set({ status: "onboarding", model: null, error: null });
      }
    } catch (e) {
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
      set({ status: "unlocked", model, pendingKit: kit });
      return kit;
    } finally {
      set({ busy: false });
    }
  },

  unlock: async (password) => {
    set({ busy: true, error: null });
    try {
      await vaultApi.unlock(password);
      set({ status: "unlocked", model: await loadModel() });
    } catch (e) {
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
      // §4.1 path B: a recovery unlock forces the user to set a new master password next.
      set({ status: "reset", model: await loadModel() });
    } catch (e) {
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
    set({ status: "locked", model: null, pendingKit: null, error: null });
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

  dismissKit: () => set({ pendingKit: null }),
}));
