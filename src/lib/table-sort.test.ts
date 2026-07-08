import { describe, expect, it } from "vitest";

import { nextSortState, stableSortBy, type SortState } from "./table-sort";

describe("table sort helpers", () => {
  it("starts a column ascending and toggles the active column", () => {
    expect(nextSortState(null, "name")).toEqual({
      column: "name",
      direction: "asc",
    });
    expect(nextSortState({ column: "name", direction: "asc" }, "name")).toEqual(
      {
        column: "name",
        direction: "desc",
      },
    );
    expect(
      nextSortState({ column: "name", direction: "desc" }, "date"),
    ).toEqual({
      column: "date",
      direction: "asc",
    });
    expect(
      nextSortState({ column: "name", direction: "desc" }, "name"),
    ).toEqual({
      column: "name",
      direction: "asc",
    });
  });

  it("sorts stably by mixed display values", () => {
    const items = [
      { id: "a", name: "Item 2", amount: 10 },
      { id: "b", name: "Item 10", amount: 5 },
      { id: "c", name: "Item 1", amount: 10 },
    ];

    const byAmount: SortState<"amount"> = {
      column: "amount",
      direction: "asc",
    };
    expect(
      stableSortBy(items, byAmount, (item) => item.amount).map(
        (item) => item.id,
      ),
    ).toEqual(["b", "a", "c"]);

    const byName: SortState<"name"> = { column: "name", direction: "asc" };
    expect(
      stableSortBy(items, byName, (item) => item.name).map((item) => item.id),
    ).toEqual(["c", "a", "b"]);
  });

  it("keeps missing values last in ascending order", () => {
    const items = [
      { id: "a", date: null },
      { id: "b", date: new Date("2026-07-08T00:00:00.000Z") },
      { id: "c", date: new Date("invalid") },
      { id: "d", date: new Date("2026-07-07T00:00:00.000Z") },
    ];

    expect(
      stableSortBy(
        items,
        { column: "date", direction: "asc" },
        (item) => item.date,
      ).map((item) => item.id),
    ).toEqual(["d", "b", "a", "c"]);
  });

  it("sorts boolean values in both directions", () => {
    const items = [
      { id: "open", done: false },
      { id: "closed", done: true },
      { id: "later", done: false },
    ];

    expect(
      stableSortBy(
        items,
        { column: "done", direction: "asc" },
        (item) => item.done,
      ).map((item) => item.id),
    ).toEqual(["open", "later", "closed"]);

    expect(
      stableSortBy(
        items,
        { column: "done", direction: "desc" },
        (item) => item.done,
      ).map((item) => item.id),
    ).toEqual(["closed", "open", "later"]);
  });

  it("treats NaN as a missing numeric value", () => {
    const items = [
      { id: "bad", amount: Number.NaN },
      { id: "good", amount: 3 },
      { id: "zero", amount: 0 },
    ];

    expect(
      stableSortBy(
        items,
        { column: "amount", direction: "asc" },
        (item) => item.amount,
      ).map((item) => item.id),
    ).toEqual(["zero", "good", "bad"]);
  });
});
