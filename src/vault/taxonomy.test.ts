import { describe, expect, it } from "vitest";

import { defaultSettings } from "@/vault/model";
import {
  defaultCategory,
  defaultCategoryOptions,
  defaultTagOptions,
  defaultTags,
  normalizeTags,
  optionsWithExtras,
  parseOptionLines,
  withTaxonomyDefaults,
} from "./taxonomy";

describe("taxonomy", () => {
  it("provides built-in defaults", () => {
    expect(defaultCategoryOptions()).toContain("Personal");
    expect(defaultTagOptions()).toContain("React");
    expect(defaultCategory()).toBe("Personal");
    expect(defaultTags()).toEqual(["React"]);
  });

  it("parses option lines uniquely", () => {
    expect(parseOptionLines("Work\nPersonal\nWork\n")).toEqual([
      "Work",
      "Personal",
    ]);
  });

  it("keeps unknown current values in merged option lists", () => {
    expect(optionsWithExtras(["Work", "Personal"], "Legacy")).toEqual([
      "Work",
      "Personal",
      "Legacy",
    ]);
    expect(optionsWithExtras(["Work"], ["Work", "Legacy", "  "])).toEqual([
      "Work",
      "Legacy",
    ]);
  });

  it("normalizes tag selections", () => {
    expect(normalizeTags([" React ", "Bash", "React"])).toEqual([
      "React",
      "Bash",
    ]);
  });

  it("falls back when custom defaults omit the built-ins", () => {
    expect(defaultCategory({ categoryOptions: ["Ops"], tagOptions: [] })).toBe(
      "Ops",
    );
    expect(defaultCategory({ categoryOptions: [], tagOptions: [] })).toBe(
      "Personal",
    );
    expect(defaultTags({ categoryOptions: [], tagOptions: ["Ops"] })).toEqual([
      "Ops",
    ]);
    expect(defaultTags({ categoryOptions: [], tagOptions: [""] })).toEqual([]);
  });

  it("hydrates missing taxonomy settings from a base model", () => {
    const base = defaultSettings();

    expect(withTaxonomyDefaults(undefined, base)).toEqual(base);
    expect(
      withTaxonomyDefaults(
        {
          categoryOptions: [],
          tagOptions: ["Ops"],
          modules: { passwords: { enabled: false } },
        },
        base,
      ),
    ).toMatchObject({
      categoryOptions: base.categoryOptions,
      tagOptions: ["Ops"],
      modules: { passwords: { enabled: false } },
    });
  });
});
