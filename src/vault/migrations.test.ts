import { describe, expect, it } from "vitest";

import {
  createDefaultModel,
  SCHEMA_VERSION,
  type ModuleDefaults,
} from "./model";
import {
  abandonedVaultBackupName,
  buildMigrationPlan,
  compareAppVersions,
  parseAppVersion,
  pendingMigrations,
  preMigrationBackupName,
  preRestoreBackupName,
  prepareVaultModel,
  vaultBackupName,
  VaultCompatibilityError,
} from "./migrations";

const NOW = "2026-07-07T00:00:00.000Z";

const modules: ModuleDefaults[] = [
  {
    id: "passwords",
    enabledByDefault: true,
    searchableByDefault: true,
    createEmpty: () => [],
  },
  {
    id: "finance",
    enabledByDefault: false,
    searchableByDefault: false,
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
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 9],
      [9, 10],
      [10, 11],
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
    expect(plan?.changes.map((c) => c.path)).toContain("modules.todos[].title");
    expect(plan?.changes.map((c) => c.path)).toContain(
      "modules.subscriptions[].service",
    );
    expect(plan?.migratedModel.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(plan?.migratedModel.settings.dashboardHotkey).toBe("Cmd+Shift+D");
    expect(plan?.migratedModel.settings.modules.passwords.enabled).toBe(false);
    expect(plan?.migratedModel.settings.modules.passwords.searchable).toBe(
      true,
    );
    expect(plan?.migratedModel.modules.passwords).toEqual([
      {
        id: "keep",
        name: "",
        username: "",
        password: "",
        loginUrl: "",
        recoveryUrl: "",
        notes: "",
        category: "Personal",
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
        category: "Personal",
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

    const migrated = prepared.model.modules.passwords as { id: string }[];
    expect(migrated[0].id).toBe("legacy-password-1");
    expect(migrated[1].id).toBe("legacy-password-2");
  });

  it("normalizes old todo records during the v3 to v4 migration", () => {
    const model = {
      ...createDefaultModel(NOW),
      meta: {
        schemaVersion: 3,
        appVersion: "0.0",
        createdAt: NOW,
        updatedAt: NOW,
      },
      modules: {
        todos: [
          {
            id: "todo-1",
            title: "Renew passport",
            done: true,
            dueAt: "2026-07-08T12:00:00.000Z",
            priority: "high",
            recurrence: null,
            tags: ["life", 5],
          },
          {
            title: "Legacy reminder",
            notes: "old",
            notifyLeadMinutes: 5,
            priority: "low",
            recurrence: "weekly",
            updatedAt: "2026-07-08T00:00:00.000Z",
          },
          "not an object",
        ],
      },
    };

    const prepared = prepareVaultModel(model, modules);

    expect(prepared.migration?.changes.map((c) => c.path)).toContain(
      "modules.todos[].notifyLeadMinutes",
    );
    expect(prepared.model.modules.todos).toEqual([
      {
        id: "todo-1",
        title: "Renew passport",
        notes: "",
        done: true,
        dueAt: "2026-07-08T12:00:00.000Z",
        notifyLeadMinutes: 30,
        priority: "high",
        category: "Personal",
        recurrence: "none",
        updatedAt: NOW,
      },
      {
        id: "legacy-todo-2",
        title: "Legacy reminder",
        notes: "old",
        done: false,
        dueAt: null,
        notifyLeadMinutes: 5,
        priority: "low",
        category: "Personal",
        recurrence: "weekly",
        updatedAt: "2026-07-08T00:00:00.000Z",
      },
      {
        id: "legacy-todo-3",
        title: "",
        notes: "",
        done: false,
        dueAt: null,
        notifyLeadMinutes: 30,
        priority: "normal",
        category: "Personal",
        recurrence: "none",
        updatedAt: NOW,
      },
    ]);
  });

  it("normalizes old subscription records during the v4 to v5 migration", () => {
    const model = {
      ...createDefaultModel(NOW),
      meta: {
        schemaVersion: 4,
        appVersion: "0.0",
        createdAt: NOW,
        updatedAt: NOW,
      },
      modules: {
        subscriptions: [
          {
            id: "sub-1",
            service: "Linode",
            url: "https://cloud.linode.com/account/billing",
            amount: 20,
            currency: "usd",
            cycle: "custom",
            customIntervalDays: 45,
            nextDueDate: "2026-07-10T00:00:00.000Z",
            autoRenew: false,
            notifyLeadDays: 7,
            notes: "VPS",
          },
          {
            service: "Legacy",
            amount: -1,
            currency: "",
            cycle: "bad",
            customIntervalDays: 0,
          },
          "not an object",
        ],
      },
    };

    const prepared = prepareVaultModel(model, modules);

    expect(prepared.migration?.changes.map((c) => c.path)).toContain(
      "modules.subscriptions[].notifyLeadDays",
    );
    expect(prepared.model.modules.subscriptions).toEqual([
      {
        id: "sub-1",
        service: "Linode",
        url: "https://cloud.linode.com/account/billing",
        amount: 20,
        currency: "USD",
        cycle: "custom",
        customIntervalDays: 45,
        nextDueDate: "2026-07-10T00:00:00.000Z",
        autoRenew: false,
        notifyLeadDays: 7,
        notes: "VPS",
        category: "Personal",
        tags: [],
        updatedAt: NOW,
      },
      {
        id: "legacy-subscription-2",
        service: "Legacy",
        url: "",
        amount: 0,
        currency: "CNY",
        cycle: "monthly",
        customIntervalDays: null,
        nextDueDate: NOW,
        autoRenew: true,
        notifyLeadDays: 3,
        notes: "",
        category: "Personal",
        tags: [],
        updatedAt: NOW,
      },
      {
        id: "legacy-subscription-3",
        service: "",
        url: "",
        amount: 0,
        currency: "CNY",
        cycle: "monthly",
        customIntervalDays: null,
        nextDueDate: NOW,
        autoRenew: true,
        notifyLeadDays: 3,
        notes: "",
        category: "Personal",
        tags: [],
        updatedAt: NOW,
      },
    ]);
  });

  it("adds searchable defaults during the v8 to v9 migration", () => {
    const model = {
      ...createDefaultModel(NOW),
      meta: {
        schemaVersion: 8,
        appVersion: "0.0",
        createdAt: NOW,
        updatedAt: NOW,
      },
      settings: {
        ...createDefaultModel(NOW).settings,
        modules: {
          passwords: { enabled: true },
          commands: { enabled: true },
          todos: { enabled: true },
          finance: { enabled: false },
        },
      },
    };

    const prepared = prepareVaultModel(model, modules);

    expect(prepared.migration?.changes.map((c) => c.path)).toContain(
      "settings.modules.*.searchable",
    );
    expect(prepared.model.settings.modules.passwords).toEqual({
      enabled: true,
      searchable: true,
    });
    expect(prepared.model.settings.modules.commands).toEqual({
      enabled: true,
      searchable: true,
    });
    expect(prepared.model.settings.modules.todos).toEqual({
      enabled: true,
      searchable: false,
    });
    expect(prepared.model.settings.modules.finance).toEqual({
      enabled: false,
      searchable: false,
      holderOptions: ["Me", "Wife", "Child", "Parent"],
      categoryOptions: [
        "Bank",
        "Crypto",
        "Real estate",
        "Stock",
        "Gold",
        "Lent",
        "E-wallet",
      ],
    });
  });

  it("adds holder and finance option lists during the v9 to v10 migration", () => {
    const model = {
      ...createDefaultModel(NOW),
      meta: {
        schemaVersion: 9,
        appVersion: "1.0",
        createdAt: NOW,
        updatedAt: NOW,
      },
      settings: {
        ...createDefaultModel(NOW).settings,
        modules: {
          finance: {
            enabled: true,
            searchable: false,
            baseCurrency: "CNY",
            fxRates: { USD: 7 },
          },
        },
      },
      modules: {
        finance: [
          {
            id: "s1",
            date: NOW,
            note: "",
            entries: [
              {
                place: "DBS",
                category: "bank",
                amount: 100,
                currency: "SGD",
              },
            ],
            updatedAt: NOW,
          },
        ],
      },
    };

    const prepared = prepareVaultModel(model, modules);
    expect(prepared.migration?.changes.map((c) => c.path)).toEqual(
      expect.arrayContaining([
        "modules.finance[].entries[].holder",
        "settings.modules.finance.holderOptions",
        "settings.modules.finance.categoryOptions",
      ]),
    );
    expect(prepared.model.settings.modules.finance).toEqual(
      expect.objectContaining({
        enabled: true,
        searchable: false,
        baseCurrency: "CNY",
        fxRates: { USD: 7 },
        holderOptions: ["Me", "Wife", "Child", "Parent"],
        categoryOptions: expect.arrayContaining(["Bank", "Crypto"]),
      }),
    );
    expect(prepared.model.modules.finance).toEqual([
      expect.objectContaining({
        id: "s1",
        entries: [
          expect.objectContaining({
            place: "DBS",
            holder: "Me",
            category: "bank",
          }),
        ],
      }),
    ]);
  });

  it("keeps existing finance option lists and skips malformed holdings on v9→v10", () => {
    const model = {
      ...createDefaultModel(NOW),
      meta: {
        schemaVersion: 9,
        appVersion: "1.0",
        createdAt: NOW,
        updatedAt: NOW,
      },
      settings: {
        ...createDefaultModel(NOW).settings,
        modules: {
          finance: {
            enabled: true,
            searchable: false,
            holderOptions: ["Me", "Partner"],
            categoryOptions: ["Bank", "Gold"],
          },
        },
      },
      modules: {
        finance: [
          {
            id: "s1",
            date: NOW,
            note: "",
            entries: [
              "skip-me",
              ["array-entry"],
              {
                place: "DBS",
                holder: "   ",
                category: "Gold",
                amount: 10,
                currency: "CNY",
              },
              {
                place: "Chase",
                holder: "Wife",
                category: "Bank",
                amount: 1,
                currency: "USD",
              },
              null,
            ],
            updatedAt: NOW,
          },
          {
            id: "s2",
            date: NOW,
            note: "",
            entries: "not-an-array",
            updatedAt: NOW,
          },
          "not-a-snapshot",
        ],
      },
    };

    const prepared = prepareVaultModel(model, modules);
    expect(prepared.model.settings.modules.finance).toEqual(
      expect.objectContaining({
        holderOptions: ["Me", "Partner"],
        categoryOptions: ["Bank", "Gold"],
      }),
    );
    expect(prepared.model.modules.finance).toEqual([
      expect.objectContaining({
        id: "s1",
        entries: [
          "skip-me",
          ["array-entry"],
          expect.objectContaining({
            place: "DBS",
            holder: "Me",
            category: "Gold",
          }),
          expect.objectContaining({
            place: "Chase",
            holder: "Wife",
          }),
          null,
        ],
      }),
      expect.objectContaining({
        id: "s2",
        entries: "not-an-array",
      }),
      "not-a-snapshot",
    ]);
  });

  it("leaves a non-array finance slice untouched during v9→v10", () => {
    const model = {
      ...createDefaultModel(NOW),
      meta: {
        schemaVersion: 9,
        appVersion: "1.0",
        createdAt: NOW,
        updatedAt: NOW,
      },
      modules: {
        finance: { snapshots: [] },
      },
    };

    const prepared = prepareVaultModel(model, modules);
    expect(prepared.model.modules.finance).toEqual({ snapshots: [] });
    expect(prepared.model.settings.modules.finance).toEqual(
      expect.objectContaining({
        holderOptions: ["Me", "Wife", "Child", "Parent"],
        categoryOptions: expect.arrayContaining(["Bank"]),
      }),
    );
  });

  it("documents optional finance dueDate during the v10 to v11 migration", () => {
    const model = {
      ...createDefaultModel(NOW),
      meta: {
        schemaVersion: 10,
        appVersion: "1.0",
        createdAt: NOW,
        updatedAt: NOW,
      },
      modules: {
        finance: [
          {
            id: "s1",
            date: NOW,
            note: "",
            entries: [
              {
                place: "DBS",
                holder: "Me",
                category: "Bank",
                amount: 100,
                currency: "SGD",
              },
            ],
            updatedAt: NOW,
          },
        ],
      },
    };

    const prepared = prepareVaultModel(model, modules);
    expect(prepared.migration?.changes.map((c) => c.path)).toContain(
      "modules.finance[].entries[].dueDate",
    );
    expect(prepared.model.meta.schemaVersion).toBe(11);
    expect(prepared.model.modules.finance).toEqual(model.modules.finance);
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
      "ownkeep-pre-migration-v0.1-to-v0.2-20260707-1530.dat",
    );
    expect(preRestoreBackupName(date)).toBe(
      "ownkeep-pre-restore-20260707-1530.dat",
    );
    expect(abandonedVaultBackupName(date)).toBe(
      "ownkeep-abandoned-20260707-1530.dat",
    );
    expect(vaultBackupName("0.1", date)).toBe("ownkeep-v0.1-20260707-1530.dat");
  });
});
