import { DEFAULT_CURRENCY } from "@/components/currency-select";

export const FINANCE_MODULE_ID = "finance";
export const DEFAULT_BASE_CURRENCY = DEFAULT_CURRENCY;

/** One holding within a snapshot (place + holder + category + balance). */
export interface FinanceEntry {
  place: string;
  /** Who owns this holding (from Finance settings holder options). */
  holder: string;
  category: string;
  amount: number;
  currency: string;
  /** Optional due date (ISO local end-of-day); omit when unset. */
  dueDate?: string;
}

/** A point-in-time net-worth snapshot across all holdings. The finance slice is `Snapshot[]`. */
export interface Snapshot {
  id: string;
  /** ISO instant at UTC start-of-day (like other modules' dates). */
  date: string;
  entries: FinanceEntry[];
  note: string;
  updatedAt: string;
}

export interface FinanceEntryInput {
  place: string;
  holder: string;
  category: string;
  amount: string;
  currency: string;
  /** Calendar date `YYYY-MM-DD`, or empty when unset. */
  dueDate: string;
}

export interface SnapshotFormInput {
  date: string;
  note: string;
  entries: FinanceEntryInput[];
}
