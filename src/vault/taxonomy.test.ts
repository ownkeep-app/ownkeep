import { describe, expect, it } from "vitest";

import {
  defaultCategory,
  defaultCategoryOptions,
  defaultTagOptions,
  defaultTags,
  normalizeTags,
  optionsWithExtras,
  parseOptionLines,
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
  });

  it("normalizes tag selections", () => {
    expect(normalizeTags([" React ", "Bash", "React"])).toEqual([
      "React",
      "Bash",
    ]);
  });
});
