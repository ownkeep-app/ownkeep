import { describe, expect, it } from "vitest";

import { defaultSettings } from "@/vault/model";
import {
  DEFAULT_FINANCE_CATEGORY,
  DEFAULT_HOLDER,
  defaultFinanceCategory,
  defaultHolder,
  parseFinanceOptionLines,
  readFinanceTaxonomy,
} from "./settings";

describe("finance settings taxonomy", () => {
  it("returns built-in holders and categories by default", () => {
    const taxonomy = readFinanceTaxonomy(defaultSettings());
    expect(taxonomy.holderOptions[0]).toBe(DEFAULT_HOLDER);
    expect(taxonomy.categoryOptions[0]).toBe(DEFAULT_FINANCE_CATEGORY);
    expect(defaultHolder(taxonomy)).toBe(DEFAULT_HOLDER);
    expect(defaultFinanceCategory(taxonomy)).toBe(DEFAULT_FINANCE_CATEGORY);
  });

  it("prefers saved finance option lists and falls back when emptied", () => {
    const settings = defaultSettings();
    settings.modules.finance = {
      enabled: true,
      holderOptions: ["Partner", "Me"],
      categoryOptions: ["Cash"],
    };
    const taxonomy = readFinanceTaxonomy(settings);
    expect(taxonomy.holderOptions).toEqual(["Partner", "Me"]);
    expect(defaultHolder(taxonomy)).toBe("Me");
    expect(defaultFinanceCategory(taxonomy)).toBe("Cash");

    settings.modules.finance = {
      enabled: true,
      holderOptions: [],
      categoryOptions: ["", "  "],
    };
    expect(readFinanceTaxonomy(settings).holderOptions).toContain("Me");
    expect(readFinanceTaxonomy(settings).categoryOptions).toContain("Bank");
  });

  it("defaults to the first option when Me / Bank are not listed", () => {
    expect(
      defaultHolder({ holderOptions: ["Partner"], categoryOptions: [] }),
    ).toBe("Partner");
    expect(
      defaultFinanceCategory({
        holderOptions: [],
        categoryOptions: ["Cash", "Gold"],
      }),
    ).toBe("Cash");
    expect(defaultHolder()).toBe(DEFAULT_HOLDER);
    expect(defaultFinanceCategory()).toBe(DEFAULT_FINANCE_CATEGORY);
    expect(defaultHolder({ holderOptions: [""], categoryOptions: [] })).toBe(
      DEFAULT_HOLDER,
    );
    expect(
      defaultFinanceCategory({ holderOptions: [], categoryOptions: [""] }),
    ).toBe(DEFAULT_FINANCE_CATEGORY);
  });

  it("parses option lines like the global taxonomy editor", () => {
    expect(parseFinanceOptionLines("Me\n\nWife\nMe")).toEqual(["Me", "Wife"]);
  });
});
