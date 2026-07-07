import { describe, expect, it } from "vitest";

import {
  createDefaultModel,
  SCHEMA_VERSION,
  type ModuleDefaults,
} from "./model";
import {
  buildMigrationPlan,
  compareAppVersions,
  parseAppVersion,
  pendingMigrations,
  preMigrationBackupName,
  prepareVaultModel,
  vaultBackupName,
  VaultCompatibilityError,
} from "./migrations";

const NOW = "2026-07-07T00:00:00.000Z";

const modules: ModuleDefaults[] = [
  { id: "passwords", enabledByDefault: true, createEmpty: () => [] },
  {
    id: "finance",
    enabledByDefault: false,
    createEmpty: () => ({ snapshots: [] }),
  },
];

function schemaOneModel() {
  return {
    ...createDefaultModel(NOW),
    meta: {
      schemaVersion: 1,
      appVersion: "0.0",
      createdAt: NOW,
      updatedAt: NOW,
    },
    settings: {
      ...createDefaultModel(NOW).settings,
      dashboardHotkey: "",
      modules: { passwords: { enabled: false } },
    },
    modules: { passwords: [{ id: "keep" }] },
  };
}

describe("app version comparison", () => {
  it("parses main.minor app versions", () => {
    expect(parseAppVersion("1.12")).toEqual({ main: 1, minor: 12 });
  });

  it("compares by integer pairs", () => {
    expect(compareAppVersions("1.10", "1.2")).toBe(1);
    expect(compareAppVersions("2.0", "1.99")).toBe(1);
    expect(compareAppVersions("1.2", "1.2")).toBe(0);
    expect(compareAppVersions("0.9", "1.0")).toBe(-1);
  });

  it("rejects non-product version formats", () => {
    expect(() => parseAppVersion("0.1.0")).toThrow(/main\.minor/);
  });
});

describe("migration registry", () => {
  it("finds the v1 to current schema path", () => {
    expect(pendingMigrations(1).map((m) => [m.from, m.to])).toEqual([
      [1, 2],
      [2, 3],
    ]);
  });

  it("fails clearly when no ordered migration path exists", () => {
    expect(() => pendingMigrations(0)).toThrow(/no migration path/i);
  });

  it("generates a guide and migrated model from the same registry step", () => {
    const plan = buildMigrationPlan(schemaOneModel(), modules);
    expect(plan?.fromSchemaVersion).toBe(1);
    expect(plan?.toSchemaVersion).toBe(SCHEMA_VERSION);
    expect(plan?.changes.map((c) => c.path)).toContain(
      "settings.dashboardHotkey",
    );
    expect(plan?.changes.map((c) => c.path)).toContain(
      "modules.passwords[].password",
    );
    expect(plan?.migratedModel.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(plan?.migratedModel.settings.dashboardHotkey).toBe("Cmd+Shift+D");
    expect(plan?.migratedModel.settings.modules.passwords.enabled).toBe(false);
    expect(plan?.migratedModel.modules.passwords).toEqual([
      {
        id: "keep",
        name: "",
        username: "",
        password: "",
        loginUrl: "",
        recoveryUrl: "",
        notes: "",
        tags: [],
        updatedAt: NOW,
      },
    ]);
    expect(plan?.migratedModel.modules.finance).toEqual({ snapshots: [] });
  });

  it("normalizes old password-like records during the v2 to v3 migration", () => {
    const model = {
      ...createDefaultModel(NOW),
      meta: {
        schemaVersion: 2,
        appVersion: "0.0",
        createdAt: NOW,
        updatedAt: NOW,
      },
      modules: {
        passwords: [
          {
            id: "github",
            name: "GitHub",
            username: "sha",
            password: "secret",
            tags: ["dev", 10],
          },
        ],
      },
    };

    const prepared = prepareVaultModel(model, modules);

    expect(prepared.migration?.changes.map((c) => c.path)).toContain(
      "modules.passwords[].loginUrl",
    );
    expect(prepared.model.modules.passwords).toEqual([
      {
        id: "github",
        name: "GitHub",
        username: "sha",
        password: "secret",
        loginUrl: "",
        recoveryUrl: "",
        notes: "",
        tags: ["dev"],
        updatedAt: NOW,
      },
    ]);
  });

  it("assigns stable ids when legacy password records are missing ids", () => {
    const model = {
      ...createDefaultModel(NOW),
      meta: {
        schemaVersion: 2,
        appVersion: "0.0",
        createdAt: NOW,
        updatedAt: NOW,
      },
      modules: {
        passwords: [{ name: "Legacy" }, "not-an-object"],
      },
    };

    const prepared = prepareVaultModel(model, modules);

    expect(prepared.model.modules.passwords[0].id).toBe("legacy-password-1");
    expect(prepared.model.modules.passwords[1].id).toBe("legacy-password-2");
  });

  it("returns no migration for current-schema vaults", () => {
    const prepared = prepareVaultModel(createDefaultModel(NOW), modules);
    expect(prepared.migration).toBeNull();
    expect(prepared.model.modules.passwords).toEqual([]);
  });

  it("refuses vaults written by a newer app version", () => {
    const model = {
      ...createDefaultModel(NOW),
      meta: { ...createDefaultModel(NOW).meta, appVersion: "99.0" },
    };
    expect(() => prepareVaultModel(model, modules)).toThrow(
      VaultCompatibilityError,
    );
  });

  it("refuses vaults with a newer schema version", () => {
    const model = {
      ...createDefaultModel(NOW),
      meta: { ...createDefaultModel(NOW).meta, schemaVersion: 999 },
    };
    expect(() => prepareVaultModel(model, modules)).toThrow(
      VaultCompatibilityError,
    );
  });
});

describe("backup names", () => {
  it("includes versions and stable timestamps", () => {
    const date = new Date(2026, 6, 7, 15, 30);
    expect(preMigrationBackupName("0.1", "0.2", date)).toBe(
      "keystash-pre-migration-v0.1-to-v0.2-20260707-1530.dat",
    );
    expect(vaultBackupName("0.1", date)).toBe(
      "keystash-v0.1-20260707-1530.dat",
    );
  });
});
