import { describe, expect, it } from "vitest";

import { PAGE_GAP, pageCountFor, pageSlice, visiblePages } from "./pagination";

describe("pagination", () => {
  it("counts pages, with at least one", () => {
    expect(pageCountFor(0, 24)).toBe(1);
    expect(pageCountFor(24, 24)).toBe(1);
    expect(pageCountFor(25, 24)).toBe(2);
    expect(pageCountFor(48, 24)).toBe(2);
  });

  it("slices a page", () => {
    const items = [1, 2, 3, 4, 5];
    expect(pageSlice(items, 1, 2)).toEqual([1, 2]);
    expect(pageSlice(items, 3, 2)).toEqual([5]);
    expect(pageSlice(items, 4, 2)).toEqual([]);
  });

  it("shows every page when there are few", () => {
    expect(visiblePages(1, 1)).toEqual([1]);
    expect(visiblePages(2, 3)).toEqual([1, 2, 3]);
  });

  it("collapses the rest around the current page", () => {
    const gap = PAGE_GAP;
    expect(visiblePages(1, 10)).toEqual([1, 2, gap, 10]);
    expect(visiblePages(5, 10)).toEqual([1, gap, 4, 5, 6, gap, 10]);
    expect(visiblePages(10, 10)).toEqual([1, gap, 9, 10]);
  });
});
