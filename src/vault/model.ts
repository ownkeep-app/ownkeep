/**
 * The decrypted vault model (spec §5) as the frontend sees it.
 *
 * Rust owns the encrypted bytes and serves this JSON as a projection; the frontend owns the *shape*
 * (so Rust stays module-agnostic per §3.4). Everything here is pure and unit-tested — no Tauri.
 */

export const SCHEMA_VERSION = 3;
export const APP_VERSION = __KEYSTASH_APP_VERSION__;

export type Theme = "system" | "light" | "dark";

export interface VaultMeta {
  schemaVersion: number;
  appVersion: string;
  createdAt: string;
  updatedAt: string;
}

/** Per-module settings: the enable flag plus arbitrary module-specific keys. */
export interface ModuleSettings {
  enabled: boolean;
  [key: string]: unknown;
}

export interface VaultSettings {
  globalHotkey: string;
  dashboardHotkey: string;
  /** Idle minutes before auto-lock wipes keys/plaintext (spec §4.3); `0` = never. */
  autoLockMinutes: number;
  lockOnBlur: boolean;
  clipboardClearSeconds: number;
  theme: Theme;
  accent: string;
  resultLimit: number;
  modules: Record<string, ModuleSettings>;
}

export interface FrecencyEntry {
  count: number;
  lastUsedAt: string;
}

export interface VaultModel {
  meta: VaultMeta;
  settings: VaultSettings;
  frecency: Record<string, FrecencyEntry>;
  /** Module id → data slice (array or object). Empty until modules land in later phases. */
  modules: Record<string, unknown>;
}

/** The minimal module shape needed to hydrate defaults (satisfied by `FeatureModule`). */
export interface ModuleDefaults {
  id: string;
  enabledByDefault: boolean;
  createEmpty: () => unknown;
}

export function defaultSettings(): VaultSettings {
  return {
    globalHotkey: "Cmd+Shift+Space",
    dashboardHotkey: "Cmd+Shift+D",
    autoLockMinutes: 60,
    lockOnBlur: false,
    clipboardClearSeconds: 30,
    theme: "system",
    accent: "#4F7CFF",
    resultLimit: 9,
    modules: {},
  };
}

export function createDefaultModel(now: string): VaultModel {
  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      appVersion: APP_VERSION,
      createdAt: now,
      updatedAt: now,
    },
    settings: defaultSettings(),
    frecency: {},
    modules: {},
  };
}

/**
 * Parse the JSON projection from Rust into a full model, filling any missing top-level sections
 * with defaults. Handles the freshly-created vault (body `"{}"`) and forward-compatible extra keys.
 */
export function parseVaultJson(json: string, now: string): VaultModel {
  let raw: Partial<VaultModel> = {};
  try {
    raw = JSON.parse(json) as Partial<VaultModel>;
  } catch {
    raw = {};
  }
  const base = createDefaultModel(now);
  return {
    meta: { ...base.meta, ...(raw.meta ?? {}) },
    settings: {
      ...base.settings,
      ...(raw.settings ?? {}),
      modules: { ...(raw.settings?.modules ?? {}) },
    },
    frecency: raw.frecency ?? {},
    modules: raw.modules ?? {},
  };
}

/**
 * Non-destructively ensure every registered module has a settings entry (enable flag) and a data
 * slice. Existing entries are preserved, so enabling/adding a module never migrates other slices.
 */
export function ensureModuleDefaults(
  model: VaultModel,
  modules: ModuleDefaults[],
): VaultModel {
  const moduleSettings = { ...model.settings.modules };
  const moduleData = { ...model.modules };
  for (const m of modules) {
    if (!moduleSettings[m.id]) {
      moduleSettings[m.id] = { enabled: m.enabledByDefault };
    }
    if (!(m.id in moduleData)) {
      moduleData[m.id] = m.createEmpty();
    }
  }
  return {
    ...model,
    settings: { ...model.settings, modules: moduleSettings },
    modules: moduleData,
  };
}

export function isModuleEnabled(model: VaultModel, id: string): boolean {
  return model.settings.modules[id]?.enabled ?? false;
}

/** Toggle a module's enable flag, preserving its other settings and every other module's entry. */
export function setModuleEnabled(
  model: VaultModel,
  id: string,
  enabled: boolean,
): VaultModel {
  const existing = model.settings.modules[id] ?? { enabled };
  return {
    ...model,
    settings: {
      ...model.settings,
      modules: { ...model.settings.modules, [id]: { ...existing, enabled } },
    },
  };
}

/** Stamp current app/schema metadata before persisting a mutated model. */
export function withUpdatedAt(model: VaultModel, now: string): VaultModel {
  return {
    ...model,
    meta: {
      ...model.meta,
      appVersion: APP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      updatedAt: now,
    },
  };
}
