export const FINANCE_MODULE_ID = "finance";
export const DEFAULT_BASE_CURRENCY = "USD";

/** One holding within a snapshot (a place + category + balance in some currency). */
export interface FinanceEntry {
  place: string;
  category: string;
  amount: number;
  currency: string;
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
  category: string;
  amount: string;
  currency: string;
}

export interface SnapshotFormInput {
  date: string;
  note: string;
  entries: FinanceEntryInput[];
}
