import { MODULES } from "@/modules/registry";
import {
  APP_VERSION,
  defaultSettings,
  ensureModuleDefaults,
  SCHEMA_VERSION,
  type ModuleDefaults,
  type VaultModel,
} from "./model";

export const OLD_APP_MESSAGE =
  "You are using an older version of keystash. Please upgrade keystash to open this vault.";

export type VersionComparison = -1 | 0 | 1;
export type ChangeKind = "added" | "renamed" | "removed" | "transformed";

export interface AppVersion {
  main: number;
  minor: number;
}

export interface SchemaChange {
  kind: ChangeKind;
  path: string;
  newPath?: string;
  note: string;
  dataLoss?: boolean;
}

export interface Migration {
  from: number;
  to: number;
  summary: string;
  changes: SchemaChange[];
  apply: (model: VaultModel) => VaultModel;
}

export interface MigrationPlan {
  fromSchemaVersion: number;
  toSchemaVersion: number;
  fromAppVersion: string;
  toAppVersion: string;
  steps: Migration[];
  changes: SchemaChange[];
  migratedModel: VaultModel;
}

export class VaultCompatibilityError extends Error {
  constructor(message = OLD_APP_MESSAGE) {
    super(message);
    this.name = "VaultCompatibilityError";
  }
}

const schemaOneToTwo: Migration = {
  from: 1,
  to: 2,
  summary:
    "Add the registry-backed app shell, Dashboard settings, and module slices.",
  changes: [
    {
      kind: "added",
      path: "settings.dashboardHotkey",
      note: "Adds the configurable Dashboard hotkey with the default Cmd+Shift+D.",
    },
    {
      kind: "added",
      path: "settings.modules",
      note: "Adds per-module enable settings so registered modules can appear in the Dashboard.",
    },
    {
      kind: "added",
      path: "modules.*",
      note: "Adds empty data slices for registered modules; existing data is preserved.",
    },
  ],
  apply: (model) => {
    const defaults = defaultSettings();
    return {
      ...model,
      meta: { ...model.meta, schemaVersion: 2 },
      settings: {
        ...defaults,
        ...model.settings,
        dashboardHotkey:
          model.settings.dashboardHotkey || defaults.dashboardHotkey,
        modules: { ...model.settings.modules },
      },
      frecency: model.frecency ?? {},
      modules: model.modules ?? {},
    };
  },
};

export const MIGRATIONS: Migration[] = [schemaOneToTwo];

export function parseAppVersion(version: string): AppVersion {
  const match = /^(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Invalid app version "${version}". Expected main.minor.`);
  }
  return { main: Number(match[1]), minor: Number(match[2]) };
}

export function compareAppVersions(a: string, b: string): VersionComparison {
  const left = parseAppVersion(a);
  const right = parseAppVersion(b);
  if (left.main !== right.main) {
    return left.main > right.main ? 1 : -1;
  }
  if (left.minor !== right.minor) {
    return left.minor > right.minor ? 1 : -1;
  }
  return 0;
}

export function assertVaultIsReadable(model: VaultModel): void {
  if (compareAppVersions(model.meta.appVersion, APP_VERSION) > 0) {
    throw new VaultCompatibilityError();
  }
  if (model.meta.schemaVersion > SCHEMA_VERSION) {
    throw new VaultCompatibilityError();
  }
}

export function pendingMigrations(fromSchemaVersion: number): Migration[] {
  const steps: Migration[] = [];
  let current = fromSchemaVersion;

  while (current < SCHEMA_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === current);
    if (!step) {
      throw new Error(
        `No migration path from schema ${current} to ${SCHEMA_VERSION}.`,
      );
    }
    steps.push(step);
    current = step.to;
  }

  return steps;
}

export function buildMigrationPlan(
  model: VaultModel,
  modules: ModuleDefaults[] = MODULES,
): MigrationPlan | null {
  assertVaultIsReadable(model);

  const steps = pendingMigrations(model.meta.schemaVersion);
  if (steps.length === 0) {
    return null;
  }

  const migrated = steps.reduce((next, step) => step.apply(next), model);
  const migratedModel = ensureModuleDefaults(
    {
      ...migrated,
      meta: {
        ...migrated.meta,
        schemaVersion: SCHEMA_VERSION,
        appVersion: APP_VERSION,
      },
    },
    modules,
  );

  return {
    fromSchemaVersion: model.meta.schemaVersion,
    toSchemaVersion: SCHEMA_VERSION,
    fromAppVersion: model.meta.appVersion,
    toAppVersion: APP_VERSION,
    steps,
    changes: steps.flatMap((step) => step.changes),
    migratedModel,
  };
}

export function prepareVaultModel(
  model: VaultModel,
  modules: ModuleDefaults[] = MODULES,
): { model: VaultModel; migration: MigrationPlan | null } {
  const migration = buildMigrationPlan(model, modules);
  if (migration) {
    return { model: migration.migratedModel, migration };
  }

  assertVaultIsReadable(model);
  return { model: ensureModuleDefaults(model, modules), migration: null };
}

export function preMigrationBackupName(
  oldAppVersion: string,
  newAppVersion = APP_VERSION,
  date = new Date(),
): string {
  return `keystash-pre-migration-v${oldAppVersion}-to-v${newAppVersion}-${backupTimestamp(date)}.dat`;
}

export function vaultBackupName(appVersion: string, date = new Date()): string {
  return `keystash-v${appVersion}-${backupTimestamp(date)}.dat`;
}

function backupTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join("");
}
