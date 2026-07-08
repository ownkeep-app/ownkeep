import type { IndexEntry } from "@/modules/types";
import type { VaultSettings } from "@/vault/model";
import {
  DEFAULT_BASE_CURRENCY,
  FINANCE_MODULE_ID,
  type FinanceEntry,
  type FinanceEntryInput,
  type Snapshot,
  type SnapshotFormInput,
} from "./types";

/** Manual FX table (spec §4/M3): `rates[c]` = base-currency units per 1 unit of currency `c`. */
export interface FinanceFx {
  baseCurrency: string;
  rates: Record<string, number>;
}

export interface SnapshotStats {
  /** Convertible entries summed in the base currency. */
  totalBase: number;
  /** Base-currency subtotal per category (convertible entries only). */
  byCategory: Record<string, number>;
  /** Raw per-currency subtotal (no conversion). */
  byCurrency: Record<string, number>;
  /** Currencies with no FX rate — excluded from `totalBase` / `byCategory`. */
  missingCurrencies: string[];
}

export interface TrendPoint {
  date: string;
  total: number;
}

// --- type guards ---

export function isFinanceEntry(value: unknown): value is FinanceEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<FinanceEntry>;
  return (
    typeof entry.place === "string" &&
    typeof entry.category === "string" &&
    typeof entry.amount === "number" &&
    typeof entry.currency === "string"
  );
}

export function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<Snapshot>;
  return (
    typeof snapshot.id === "string" &&
    typeof snapshot.date === "string" &&
    Array.isArray(snapshot.entries) &&
    snapshot.entries.every(isFinanceEntry) &&
    typeof snapshot.note === "string" &&
    typeof snapshot.updatedAt === "string"
  );
}

export function financeSnapshots(items: unknown[]): Snapshot[] {
  return items.filter(isSnapshot);
}

// --- FX + stats ---

export function readFinanceFx(settings: VaultSettings): FinanceFx {
  const finance = settings.modules[FINANCE_MODULE_ID];
  const baseCurrency = normalizeCurrency(
    typeof finance?.baseCurrency === "string"
      ? finance.baseCurrency
      : DEFAULT_BASE_CURRENCY,
  );
  const rates: Record<string, number> = {};
  const raw = finance?.fxRates;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [currency, rate] of Object.entries(
      raw as Record<string, unknown>,
    )) {
      if (typeof rate === "number" && Number.isFinite(rate) && rate >= 0) {
        rates[normalizeCurrency(currency)] = rate;
      }
    }
  }
  return { baseCurrency, rates };
}

/** Convert a snapshot to base-currency total + by-category, tracking any un-rated currencies. */
export function computeSnapshotStats(
  snapshot: Snapshot,
  fx: FinanceFx,
): SnapshotStats {
  let totalBase = 0;
  const byCategory: Record<string, number> = {};
  const byCurrency: Record<string, number> = {};
  const missing = new Set<string>();

  for (const entry of snapshot.entries) {
    const currency = normalizeCurrency(entry.currency);
    const amount = Number.isFinite(entry.amount) ? entry.amount : 0;
    byCurrency[currency] = roundMoney((byCurrency[currency] ?? 0) + amount);

    const rate = currency === fx.baseCurrency ? 1 : fx.rates[currency];
    if (typeof rate === "number" && Number.isFinite(rate) && rate >= 0) {
      const base = amount * rate;
      totalBase += base;
      const category = entry.category.trim() || "uncategorized";
      byCategory[category] = roundMoney((byCategory[category] ?? 0) + base);
    } else {
      missing.add(currency);
    }
  }

  return {
    totalBase: roundMoney(totalBase),
    byCategory,
    byCurrency,
    missingCurrencies: Array.from(missing).sort(),
  };
}

/** Net-worth total per snapshot, oldest → newest, for the trend chart. */
export function netWorthSeries(
  snapshots: Snapshot[],
  fx: FinanceFx,
): TrendPoint[] {
  return sortSnapshotsAscending(snapshots).map((snapshot) => ({
    date: snapshot.date,
    total: computeSnapshotStats(snapshot, fx).totalBase,
  }));
}

// --- index ---

export function buildFinanceIndex(snapshots: Snapshot[]): IndexEntry[] {
  return snapshots.map((snapshot) => ({
    id: snapshot.id,
    moduleId: FINANCE_MODULE_ID,
    type: "finance",
    searchString: [
      formatSnapshotDate(snapshot.date),
      snapshot.note,
      ...snapshot.entries.flatMap((entry) => [
        entry.place,
        entry.category,
        entry.currency,
      ]),
    ]
      .filter(Boolean)
      .join(" "),
    displayLine: `Snapshot ${formatSnapshotDate(snapshot.date)} - ${
      snapshot.entries.length
    } ${snapshot.entries.length === 1 ? "place" : "places"}`,
  }));
}

// --- sort ---

export function sortSnapshots(snapshots: Snapshot[]): Snapshot[] {
  return [...snapshots].sort((a, b) => {
    const diff = Date.parse(b.date) - Date.parse(a.date);
    if (diff !== 0) return diff;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

function sortSnapshotsAscending(snapshots: Snapshot[]): Snapshot[] {
  return [...snapshots].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

// --- forms ---

export function emptyEntryInput(): FinanceEntryInput {
  return {
    place: "",
    category: "",
    amount: "",
    currency: DEFAULT_BASE_CURRENCY,
  };
}

export function emptySnapshotForm(): SnapshotFormInput {
  return { date: "", note: "", entries: [emptyEntryInput()] };
}

export function formFromSnapshot(snapshot: Snapshot): SnapshotFormInput {
  return {
    date: isoToDateInput(snapshot.date),
    note: snapshot.note,
    entries: snapshot.entries.length
      ? snapshot.entries.map((entry) => ({
          place: entry.place,
          category: entry.category,
          amount: String(entry.amount),
          currency: entry.currency,
        }))
      : [emptyEntryInput()],
  };
}

export function createSnapshot(
  input: SnapshotFormInput,
  now: string,
  id: string = crypto.randomUUID(),
): Snapshot {
  return normalizeSnapshot(
    {
      id,
      date: dateInputToIso(input.date) ?? now,
      entries: parseEntries(input.entries),
      note: input.note,
      updatedAt: now,
    },
    now,
  );
}

export function updateSnapshot(
  existing: Snapshot,
  input: SnapshotFormInput,
  now: string,
): Snapshot {
  return normalizeSnapshot(
    {
      ...existing,
      date: dateInputToIso(input.date) ?? existing.date,
      entries: parseEntries(input.entries),
      note: input.note,
      updatedAt: now,
    },
    now,
  );
}

export function validateSnapshotInput(input: SnapshotFormInput): string | null {
  if (!dateInputToIso(input.date)) return "Snapshot date is required.";
  for (const entry of filledEntries(input.entries)) {
    if (!entry.place.trim()) return "Each entry needs a place.";
    const amount = Number(entry.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return "Each amount must be zero or greater.";
    }
    if (!entry.currency.trim()) return "Each entry needs a currency.";
  }
  return null;
}

// --- formatting ---

export function formatSnapshotDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatMoney(amount: number, currency: string): string {
  return `${normalizeCurrency(currency)} ${roundMoney(amount).toFixed(2)}`;
}

export function isoToDateInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function dateInputToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// --- internals ---

function filledEntries(entries: FinanceEntryInput[]): FinanceEntryInput[] {
  return entries.filter(
    (entry) =>
      entry.place.trim() || entry.amount.trim() || entry.category.trim(),
  );
}

function parseEntries(entries: FinanceEntryInput[]): FinanceEntry[] {
  return filledEntries(entries)
    .map((entry) => ({
      place: entry.place.trim(),
      category: entry.category.trim() || "uncategorized",
      amount: parseAmount(entry.amount),
      currency: normalizeCurrency(entry.currency),
    }))
    .filter((entry) => entry.place.length > 0);
}

function normalizeSnapshot(
  snapshot: Snapshot,
  fallbackUpdatedAt: string,
): Snapshot {
  return {
    id: snapshot.id,
    date: snapshot.date,
    entries: snapshot.entries,
    note: snapshot.note.trim(),
    updatedAt: snapshot.updatedAt || fallbackUpdatedAt,
  };
}

function parseAmount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase() || DEFAULT_BASE_CURRENCY;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
