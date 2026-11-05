import { describe, expect, it } from "vitest";

import { moveItem } from "./reorder";

const items = ["a", "b", "c", "d"].map((id) => ({ id }));
const ids = (list: { id: string }[]) => list.map((item) => item.id).join("");

describe("moveItem", () => {
  it("moves forward onto the target's slot", () => {
    expect(ids(moveItem(items, "a", "c"))).toBe("bcad");
    expect(ids(moveItem(items, "a", "d"))).toBe("bcda");
  });

  it("moves back onto the target's slot", () => {
    expect(ids(moveItem(items, "d", "b"))).toBe("adbc");
    expect(ids(moveItem(items, "d", "a"))).toBe("dabc");
  });

  it("swaps neighbours", () => {
    expect(ids(moveItem(items, "b", "c"))).toBe("acbd");
    expect(ids(moveItem(items, "c", "b"))).toBe("acbd");
  });

  it("leaves the order alone for itself or unknown ids, without mutating", () => {
    expect(ids(moveItem(items, "b", "b"))).toBe("abcd");
    expect(ids(moveItem(items, "x", "b"))).toBe("abcd");
    expect(ids(moveItem(items, "b", "x"))).toBe("abcd");
    expect(ids(items)).toBe("abcd");
  });
});
