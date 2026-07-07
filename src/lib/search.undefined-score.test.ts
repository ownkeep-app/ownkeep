import { describe, expect, it, vi } from "vitest";

import type { IndexEntry } from "@/modules/types";

vi.mock("fuse.js", () => ({
  default: class Fuse {
    search() {
      return [
        {
          item: {
            id: "x",
            moduleId: "m",
            type: "t",
            searchString: "",
            displayLine: "",
          },
        },
      ];
    }
  },
}));

describe("search", () => {
  it("treats missing Fuse score as worst match", async () => {
    const { search } = await import("./search");
    const entries: IndexEntry[] = [
      {
        id: "x",
        moduleId: "m",
        type: "t",
        searchString: "x",
        displayLine: "x",
      },
    ];
    const results = search("x", entries, {}, 9, Date.now());
    expect(results[0].entry.id).toBe("x");
    expect(results[0].score).toBe(0);
  });
});
