import { describe, expect, it } from "vitest";

import {
  createDefaultModel,
  ensureModuleDefaults,
  isModuleEnabled,
  isModuleSearchable,
  parseVaultJson,
  recordFrecency,
  setModuleEnabled,
  setModuleSearchable,
  APP_VERSION,
  SCHEMA_VERSION,
  type ModuleDefaults,
  type VaultModel,
  withUpdatedAt,
} from "./model";

const NOW = "2026-07-07T00:00:00.000Z";

const stubModules: ModuleDefaults[] = [
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

describe("createDefaultModel", () => {
  it("has the current schema and empty settings/modules", () => {
    const model = createDefaultModel(NOW);
    expect(model.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(model.meta.createdAt).toBe(NOW);
    expect(model.settings.modules).toEqual({});
    expect(model.modules).toEqual({});
  });
});

describe("parseVaultJson", () => {
  it("turns a freshly-created empty body into a full default model", () => {
    const model = parseVaultJson("{}", NOW);
    expect(model.settings.globalHotkey).toBe("Cmd+Shift+Space");
    expect(model.meta.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("merges stored settings over defaults and keeps module slices", () => {
    const stored = JSON.stringify({
      settings: { theme: "dark", modules: { passwords: { enabled: false } } },
      modules: { passwords: [{ id: "1" }] },
    });
    const model = parseVaultJson(stored, NOW);
    expect(model.settings.theme).toBe("dark");
    expect(model.settings.accent).toBe("#5B6CFF"); // default preserved
    expect(model.settings.modules.passwords.enabled).toBe(false);
    expect(model.modules.passwords).toEqual([{ id: "1" }]);
  });

  it("falls back to defaults on invalid JSON", () => {
    expect(parseVaultJson("not json", NOW).meta.schemaVersion).toBe(
      SCHEMA_VERSION,
    );
  });
});

describe("ensureModuleDefaults", () => {
  it("adds missing module settings + slices from the registry", () => {
    const model = ensureModuleDefaults(createDefaultModel(NOW), stubModules);
    expect(model.settings.modules.passwords).toEqual({
      enabled: true,
      searchable: true,
    });
    expect(model.settings.modules.finance).toEqual({
      enabled: false,
      searchable: false,
    });
    expect(model.modules.passwords).toEqual([]);
    expect(model.modules.finance).toEqual({ snapshots: [] });
  });

  it("preserves existing entries (no migration of other slices)", () => {
    const base: VaultModel = {
      ...createDefaultModel(NOW),
      settings: {
        ...createDefaultModel(NOW).settings,
        modules: { passwords: { enabled: false, scopePrefix: "p" } },
      },
      modules: { passwords: [{ id: "keep" }] },
    };
    const model = ensureModuleDefaults(base, stubModules);
    expect(model.settings.modules.passwords).toEqual({
      enabled: false,
      scopePrefix: "p",
    });
    expect(model.modules.passwords).toEqual([{ id: "keep" }]);
    expect(model.settings.modules.finance).toEqual({
      enabled: false,
      searchable: false,
    }); // newly added
  });
});

describe("module enable toggle", () => {
  it("reads and flips a module's enabled flag without touching others", () => {
    let model = ensureModuleDefaults(createDefaultModel(NOW), stubModules);
    expect(isModuleEnabled(model, "passwords")).toBe(true);
    expect(isModuleEnabled(model, "finance")).toBe(false);

    model = setModuleEnabled(model, "finance", true);
    expect(isModuleEnabled(model, "finance")).toBe(true);
    expect(isModuleEnabled(model, "passwords")).toBe(true); // unaffected
  });

  it("defaults to false for an unknown module", () => {
    expect(isModuleEnabled(createDefaultModel(NOW), "nope")).toBe(false);
  });
});

describe("module searchable toggle", () => {
  it("reads and flips searchable without touching enabled or other modules", () => {
    let model = ensureModuleDefaults(createDefaultModel(NOW), stubModules);
    expect(isModuleSearchable(model, "passwords")).toBe(true);
    expect(isModuleSearchable(model, "finance")).toBe(false);

    model = setModuleSearchable(model, "finance", true);
    expect(isModuleSearchable(model, "finance")).toBe(true);
    expect(isModuleEnabled(model, "finance")).toBe(false);
    expect(isModuleSearchable(model, "passwords")).toBe(true);
  });

  it("defaults to false for an unknown module", () => {
    expect(isModuleSearchable(createDefaultModel(NOW), "nope")).toBe(false);
  });
});

describe("withUpdatedAt", () => {
  it("stamps current app/schema metadata before save", () => {
    const model = {
      ...createDefaultModel(NOW),
      meta: {
        ...createDefaultModel(NOW).meta,
        schemaVersion: 1,
        appVersion: "0.0",
      },
    };

    const stamped = withUpdatedAt(model, "2026-07-08T00:00:00.000Z");

    expect(stamped.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(stamped.meta.appVersion).toBe(APP_VERSION);
    expect(stamped.meta.createdAt).toBe(NOW);
    expect(stamped.meta.updatedAt).toBe("2026-07-08T00:00:00.000Z");
  });
});

describe("recordFrecency", () => {
  it("increments the count and refreshes lastUsedAt", () => {
    const once = recordFrecency(createDefaultModel(NOW), "gh", NOW);
    expect(once.frecency.gh).toEqual({ count: 1, lastUsedAt: NOW });

    const later = "2026-07-08T00:00:00.000Z";
    const twice = recordFrecency(once, "gh", later);
    expect(twice.frecency.gh).toEqual({ count: 2, lastUsedAt: later });
  });

  it("preserves other items' frecency", () => {
    const withGh = recordFrecency(createDefaultModel(NOW), "gh", NOW);
    const withAws = recordFrecency(withGh, "aws", NOW);
    expect(withAws.frecency.gh.count).toBe(1);
    expect(withAws.frecency.aws.count).toBe(1);
  });
});
