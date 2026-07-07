import { describe, expect, it } from "vitest";

import type { FeatureModule, IndexEntry } from "@/modules/types";
import {
  createDefaultModel,
  ensureModuleDefaults,
  setModuleEnabled,
} from "@/vault/model";
import {
  buildUnifiedIndex,
  frecencyBoost,
  parseScope,
  runQuery,
  search,
} from "./search";

const NOW = Date.parse("2026-07-07T00:00:00.000Z");

function entry(id: string, searchString: string): IndexEntry {
  return {
    id,
    moduleId: "m",
    type: "t",
    searchString,
    displayLine: searchString,
  };
}

function fakeModule(
  id: string,
  prefix: string,
  entries: IndexEntry[],
): FeatureModule {
  return {
    id,
    title: id,
    icon: null,
    enabledByDefault: true,
    scopePrefix: prefix,
    createEmpty: () => [],
    buildIndex: () => entries,
    ListView: () => null,
  };
}

describe("buildUnifiedIndex", () => {
  it("includes only enabled modules", () => {
    const mods = [
      fakeModule("a", "a", [entry("a1", "alpha")]),
      fakeModule("b", "b", [entry("b1", "bravo")]),
    ];
    let model = ensureModuleDefaults(
      createDefaultModel("2026-07-07T00:00:00Z"),
      mods,
    );
    model = setModuleEnabled(model, "b", false);
    const index = buildUnifiedIndex(model, mods);
    expect(index.map((e) => e.id)).toEqual(["a1"]);
  });

  it("treats non-array module slices as empty lists", () => {
    const mods = [fakeModule("a", "a", [entry("a1", "alpha")])];
    const model = ensureModuleDefaults(
      createDefaultModel("2026-07-07T00:00:00Z"),
      mods,
    );
    const weird = {
      ...model,
      modules: { ...model.modules, a: { not: "an array" } },
    };
    expect(buildUnifiedIndex(weird, mods).map((e) => e.id)).toEqual(["a1"]);
  });
});

describe("parseScope", () => {
  const mods = [
    fakeModule("passwords", "p", []),
    fakeModule("commands", "c", []),
  ];

  it("extracts a known scope prefix", () => {
    expect(parseScope("p github", mods)).toEqual({
      moduleId: "passwords",
      term: "github",
    });
  });

  it("treats an unknown first word as part of the query", () => {
    expect(parseScope("print docs", mods)).toEqual({
      moduleId: null,
      term: "print docs",
    });
  });

  it("returns no scope for a single term", () => {
    expect(parseScope("github", mods)).toEqual({
      moduleId: null,
      term: "github",
    });
  });
});

describe("frecencyBoost", () => {
  it("is neutral with no history", () => {
    expect(frecencyBoost(undefined, NOW)).toBe(1);
  });

  it("rewards frequency and recency", () => {
    const recent = frecencyBoost(
      { count: 10, lastUsedAt: "2026-07-07T00:00:00.000Z" },
      NOW,
    );
    const old = frecencyBoost(
      { count: 10, lastUsedAt: "2026-01-01T00:00:00.000Z" },
      NOW,
    );
    const rare = frecencyBoost(
      { count: 1, lastUsedAt: "2026-07-07T00:00:00.000Z" },
      NOW,
    );
    expect(recent).toBeGreaterThan(old);
    expect(recent).toBeGreaterThan(rare);
  });
});

describe("search", () => {
  const entries = [
    entry("a", "git delete branch"),
    entry("b", "git delete branch"),
    entry("c", "docker compose up"),
  ];

  it("fuzzy-matches the query", () => {
    const results = search("docker", entries, {}, 9, NOW);
    expect(results[0].entry.id).toBe("c");
  });

  it("breaks ties by frecency", () => {
    const frecency = {
      b: { count: 20, lastUsedAt: "2026-07-07T00:00:00.000Z" },
    };
    const results = search("git branch", entries, frecency, 9, NOW);
    const ids = results.map((r) => r.entry.id);
    expect(ids.indexOf("b")).toBeLessThan(ids.indexOf("a"));
  });

  it("ranks by frecency alone for an empty query and respects the limit", () => {
    const frecency = {
      c: { count: 5, lastUsedAt: "2026-07-07T00:00:00.000Z" },
    };
    const results = search("", entries, frecency, 2, NOW);
    expect(results).toHaveLength(2);
    expect(results[0].entry.id).toBe("c");
  });

  it("is empty when no module contributed entries", () => {
    expect(search("anything", [], {}, 9, NOW)).toEqual([]);
  });
});

describe("runQuery", () => {
  function entryFor(moduleId: string, id: string, text: string): IndexEntry {
    return { id, moduleId, type: "t", searchString: text, displayLine: text };
  }
  const mods = [
    fakeModule("passwords", "p", [
      entryFor("passwords", "p1", "github login"),
      entryFor("passwords", "p2", "gitlab login"),
    ]),
    fakeModule("commands", "c", [entryFor("commands", "c1", "git status")]),
  ];
  const model = ensureModuleDefaults(
    createDefaultModel("2026-07-07T00:00:00Z"),
    mods,
  );

  it("ranks across every enabled module for a global query", () => {
    const ids = runQuery(model, mods, "git", NOW).map((r) => r.entry.id);
    expect(ids).toContain("p1");
    expect(ids).toContain("c1");
  });

  it("restricts results to the scoped module", () => {
    const ids = runQuery(model, mods, "p git", NOW).map((r) => r.entry.id);
    expect(ids).toEqual(expect.arrayContaining(["p1", "p2"]));
    expect(ids).not.toContain("c1");
  });

  it("respects the result limit from settings", () => {
    const limited = {
      ...model,
      settings: { ...model.settings, resultLimit: 1 },
    };
    expect(runQuery(limited, mods, "", NOW)).toHaveLength(1);
  });
});
