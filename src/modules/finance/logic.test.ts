import { describe, expect, it } from "vitest";

import { dateToDateInput } from "@/lib/date";
import { defaultSettings, type VaultSettings } from "@/vault/model";
import {
  buildFinanceIndex,
  computeSnapshotStats,
  createSnapshot,
  dateInputToIso,
  duplicateSnapshotForm,
  emptySnapshotForm,
  financeSnapshots,
  formatMoney,
  formatSnapshotDate,
  formFromSnapshot,
  isFinanceEntry,
  isSnapshot,
  netWorthSeries,
  readFinanceFx,
  sortSnapshots,
  updateSnapshot,
  validateSnapshotInput,
  type FinanceFx,
} from "./logic";
import type { Snapshot } from "./types";

const NOW = "2026-07-07T00:00:00.000Z";

function financeSettings(finance: Record<string, unknown>): VaultSettings {
  const base = defaultSettings();
  return {
    ...base,
    modules: { ...base.modules, finance: { enabled: true, ...finance } },
  };
}

function snapshot(
  date: string,
  entries: Snapshot["entries"],
  id = date,
): Snapshot {
  return { id, date, entries, note: "", updatedAt: date };
}

describe("guards", () => {
  it("recognizes finance entries and snapshots", () => {
    expect(
      isFinanceEntry({
        place: "DBS",
        holder: "Me",
        category: "bank",
        amount: 1,
        currency: "SGD",
      }),
    ).toBe(true);
    expect(isFinanceEntry({ place: "DBS" })).toBe(false);
    expect(
      isFinanceEntry({
        place: "DBS",
        category: "bank",
        amount: 1,
        currency: "SGD",
      }),
    ).toBe(false);
    expect(
      isFinanceEntry({
        place: "DBS",
        holder: "Me",
        category: "bank",
        amount: 1,
        currency: "SGD",
        dueDate: 1,
      }),
    ).toBe(false);
    expect(isFinanceEntry(null)).toBe(false);

    const good = snapshot("2026-07-01T00:00:00.000Z", []);
    expect(isSnapshot(null)).toBe(false);
    expect(isSnapshot(good)).toBe(true);
    expect(isSnapshot({ id: "x" })).toBe(false);
    expect(
      isSnapshot({
        id: "a",
        date: "d",
        entries: [{ nope: true }],
        note: "",
        updatedAt: "u",
      }),
    ).toBe(false);
    expect(financeSnapshots([good, { id: "bad" }])).toEqual([good]);
  });
});

describe("readFinanceFx", () => {
  it("reads base currency + valid rates, ignoring junk", () => {
    const fx = readFinanceFx(
      financeSettings({
        baseCurrency: "usd",
        fxRates: { SGD: 0.74, CNY: 0.14, BAD: -1, JUNK: "x" },
      }),
    );
    expect(fx.baseCurrency).toBe("USD");
    expect(fx.rates).toEqual({ SGD: 0.74, CNY: 0.14 });
  });

  it("defaults to CNY with no rates", () => {
    expect(readFinanceFx(defaultSettings())).toEqual({
      baseCurrency: "CNY",
      rates: {},
    });
  });
});

describe("computeSnapshotStats", () => {
  const mixed = snapshot("2026-07-01T00:00:00.000Z", [
    {
      place: "DBS",
      holder: "Me",
      category: "bank",
      amount: 12000,
      currency: "SGD",
    },
    {
      place: "Chase",
      holder: "Me",
      category: "bank",
      amount: 5000,
      currency: "USD",
    },
    {
      place: "WeChat",
      holder: "Me",
      category: "wallet",
      amount: 800,
      currency: "CNY",
    },
  ]);

  it("totals in base currency, groups by category, flags missing rates", () => {
    const stats = computeSnapshotStats(mixed, {
      baseCurrency: "USD",
      rates: { SGD: 0.74 }, // CNY intentionally missing
    });
    // 12000 * 0.74 = 8880, + 5000 USD = 13880; CNY excluded from the total.
    expect(stats.totalBase).toBe(13880);
    expect(stats.byCategory).toEqual({ bank: 13880 });
    expect(stats.byCurrency).toEqual({ SGD: 12000, USD: 5000, CNY: 800 });
    expect(stats.missingCurrencies).toEqual(["CNY"]);
  });

  it("normalizes odd amounts and blank categories while retaining raw currency totals", () => {
    const stats = computeSnapshotStats(
      snapshot("2026-07-01T00:00:00.000Z", [
        {
          place: "Cash",
          holder: "Me",
          category: "  ",
          amount: Number.NaN,
          currency: "usd",
        },
        {
          place: "Wallet",
          holder: "Me",
          category: "  ",
          amount: 2.005,
          currency: " usd ",
        },
      ]),
      { baseCurrency: "USD", rates: {} },
    );

    expect(stats.totalBase).toBe(2.01);
    expect(stats.byCategory).toEqual({ uncategorized: 2.01 });
    expect(stats.byCurrency).toEqual({ USD: 2.01 });
  });

  it("re-totals when the FX rate changes (exit criterion)", () => {
    const sgd = snapshot("2026-07-01T00:00:00.000Z", [
      {
        place: "DBS",
        holder: "Me",
        category: "bank",
        amount: 100,
        currency: "SGD",
      },
    ]);
    expect(
      computeSnapshotStats(sgd, { baseCurrency: "USD", rates: { SGD: 0.74 } })
        .totalBase,
    ).toBe(74);
    expect(
      computeSnapshotStats(sgd, { baseCurrency: "USD", rates: { SGD: 0.8 } })
        .totalBase,
    ).toBe(80);
  });
});

describe("netWorthSeries", () => {
  it("orders snapshots oldest → newest with base totals", () => {
    const fx: FinanceFx = { baseCurrency: "USD", rates: {} };
    const feb = snapshot(
      "2026-02-01T00:00:00.000Z",
      [
        {
          place: "x",
          holder: "Me",
          category: "bank",
          amount: 100,
          currency: "USD",
        },
      ],
      "feb",
    );
    const jan = snapshot(
      "2026-01-01T00:00:00.000Z",
      [
        {
          place: "y",
          holder: "Me",
          category: "bank",
          amount: 50,
          currency: "USD",
        },
      ],
      "jan",
    );
    expect(netWorthSeries([feb, jan], fx)).toEqual([
      { date: "2026-01-01T00:00:00.000Z", total: 50 },
      { date: "2026-02-01T00:00:00.000Z", total: 100 },
    ]);
  });
});

describe("index + sort", () => {
  it("builds one searchable index entry per snapshot", () => {
    const [entry] = buildFinanceIndex([
      snapshot("2026-07-01T00:00:00.000Z", [
        {
          place: "DBS",
          holder: "Me",
          category: "bank",
          amount: 1,
          currency: "SGD",
        },
      ]),
    ]);
    expect(entry.moduleId).toBe("finance");
    expect(entry.type).toBe("finance");
    expect(entry.displayLine).toContain("1 place");
    expect(entry.searchString).toContain("DBS");

    const [multiEntry] = buildFinanceIndex([
      snapshot("2026-07-01T00:00:00.000Z", [
        {
          place: "DBS",
          holder: "Me",
          category: "bank",
          amount: 1,
          currency: "SGD",
        },
        {
          place: "Chase",
          holder: "Me",
          category: "bank",
          amount: 1,
          currency: "USD",
        },
      ]),
    ]);
    expect(multiEntry.displayLine).toContain("2 places");
  });

  it("sorts snapshots newest first", () => {
    const jan = snapshot("2026-01-01T00:00:00.000Z", [], "jan");
    const mar = snapshot("2026-03-01T00:00:00.000Z", [], "mar");
    expect(sortSnapshots([jan, mar]).map((s) => s.id)).toEqual(["mar", "jan"]);

    const first = {
      ...jan,
      id: "first",
      updatedAt: "2026-01-01T01:00:00.000Z",
    };
    const second = {
      ...jan,
      id: "second",
      updatedAt: "2026-01-01T02:00:00.000Z",
    };
    expect(sortSnapshots([first, second]).map((s) => s.id)).toEqual([
      "second",
      "first",
    ]);
  });
});

describe("snapshot forms", () => {
  it("creates from form input, trimming and dropping blank rows", () => {
    const created = createSnapshot(
      {
        date: "2026-07-01",
        note: "  saved  ",
        entries: [
          {
            place: "DBS",
            holder: "Me",
            category: "bank",
            amount: "12000",
            currency: "sgd",
            dueDate: "2026-12-31",
          },
          {
            place: "",
            holder: "",
            category: "",
            amount: "",
            currency: "USD",
            dueDate: "",
          },
        ],
      },
      NOW,
      "id1",
    );
    expect(created.id).toBe("id1");
    expect(created.date).toBe(
      new Date(2026, 6, 1, 23, 59, 59, 0).toISOString(),
    );
    expect(created.note).toBe("saved");
    expect(created.entries).toEqual([
      {
        place: "DBS",
        holder: "Me",
        category: "bank",
        amount: 12000,
        currency: "SGD",
        dueDate: new Date(2026, 11, 31, 23, 59, 59, 0).toISOString(),
      },
    ]);
  });

  it("fills blank holder and category with finance defaults", () => {
    const created = createSnapshot(
      {
        date: "2026-07-01",
        note: "",
        entries: [
          {
            place: "Cash",
            holder: "  ",
            category: "  ",
            amount: "10",
            currency: "  ",
            dueDate: "",
          },
        ],
      },
      NOW,
      "id-defaults",
    );
    expect(created.entries).toEqual([
      {
        place: "Cash",
        holder: "Me",
        category: "Bank",
        amount: 10,
        currency: "CNY",
      },
    ]);
  });

  it("round-trips through formFromSnapshot + updateSnapshot", () => {
    const created = createSnapshot(
      {
        date: "2026-07-01",
        note: "n",
        entries: [
          {
            place: "DBS",
            holder: "Me",
            category: "bank",
            amount: "100",
            currency: "SGD",
            dueDate: "",
          },
        ],
      },
      NOW,
      "id1",
    );
    const form = formFromSnapshot(created);
    expect(form.date).toBe("2026-07-01");
    expect(form.entries[0]).toEqual({
      place: "DBS",
      holder: "Me",
      category: "bank",
      amount: "100",
      currency: "SGD",
      dueDate: "",
    });

    const duplicated = duplicateSnapshotForm(
      created,
      undefined,
      new Date(2026, 7, 2),
    );
    expect(duplicated.date).toBe("2026-08-02");
    expect(duplicated.note).toBe("n");
    expect(duplicated.entries).toEqual(form.entries);

    const updated = updateSnapshot(
      created,
      { ...form, note: "changed" },
      "2026-07-08T00:00:00.000Z",
    );
    expect(updated.note).toBe("changed");
    expect(updated.id).toBe("id1");
    expect(updated.updatedAt).toBe("2026-07-08T00:00:00.000Z");

    const fallback = updateSnapshot(
      { ...created, date: "2026-07-01T00:00:00.000Z", updatedAt: "" },
      { ...form, date: "bad-date", note: " fallback " },
      NOW,
    );
    expect(fallback.date).toBe("2026-07-01T00:00:00.000Z");
    expect(fallback.updatedAt).toBe(NOW);
    expect(fallback.note).toBe("fallback");
  });

  it("shows one blank row for an entry-less snapshot and the empty form", () => {
    expect(
      formFromSnapshot(snapshot("2026-07-01T00:00:00.000Z", [])).entries,
    ).toHaveLength(1);
    const empty = emptySnapshotForm();
    expect(empty.entries).toHaveLength(1);
    expect(empty.date).toBe(dateToDateInput(new Date()));
    expect(empty.entries[0].dueDate).toBe("");
  });

  it("validates the date and entry fields", () => {
    expect(validateSnapshotInput({ date: "", note: "", entries: [] })).toMatch(
      /date/i,
    );
    expect(
      validateSnapshotInput({
        date: "2026-07-01",
        note: "",
        entries: [
          {
            place: "",
            holder: "Me",
            category: "bank",
            amount: "1",
            currency: "USD",
            dueDate: "",
          },
        ],
      }),
    ).toMatch(/place/i);
    expect(
      validateSnapshotInput({
        date: "2026-07-01",
        note: "",
        entries: [
          {
            place: "DBS",
            holder: "Me",
            category: "bank",
            amount: "-5",
            currency: "USD",
            dueDate: "",
          },
        ],
      }),
    ).toMatch(/amount/i);
    expect(
      validateSnapshotInput({
        date: "2026-07-01",
        note: "",
        entries: [
          {
            place: "DBS",
            holder: "Me",
            category: "bank",
            amount: "1",
            currency: "  ",
            dueDate: "",
          },
        ],
      }),
    ).toMatch(/currency/i);
    expect(
      validateSnapshotInput({
        date: "2026-07-01",
        note: "",
        entries: [
          {
            place: "DBS",
            holder: "Me",
            category: "bank",
            amount: "1",
            currency: "USD",
            dueDate: "not-a-date",
          },
        ],
      }),
    ).toMatch(/due date/i);
    expect(
      validateSnapshotInput({
        date: "2026-07-01",
        note: "",
        entries: [
          {
            place: "DBS",
            holder: "Me",
            category: "bank",
            amount: "1",
            currency: "USD",
            dueDate: "",
          },
        ],
      }),
    ).toBeNull();
  });
});

describe("formatting", () => {
  it("formats money, dates, and date inputs", () => {
    expect(formatMoney(1234.5, "usd")).toBe("USD 1234.50");
    expect(formatSnapshotDate("2026-07-01T00:00:00.000Z")).toContain("2026");
    expect(formatSnapshotDate("nope")).toBe("Invalid date");
    expect(dateInputToIso("")).toBeNull();
    expect(dateInputToIso("not-a-date")).toBeNull();
    expect(dateInputToIso("2026-07-01")).toBe(
      new Date(2026, 6, 1, 23, 59, 59, 0).toISOString(),
    );
  });
});
