import dayjs from "dayjs";

/** Calendar-day due urgency (null when undated or invalid). */
export type DueStatusKind = "overdue" | "today" | "upcoming";

/** Badge wording: manual dues vs auto-renew invoices. */
export type DueStatusVocabulary = "due" | "invoice";

export interface DueStatus {
  kind: DueStatusKind;
  label: string;
}

/**
 * Relative date badge. Compares calendar days in the local timezone
 * (not wall-clock hours).
 * - `due`: Overdue / Due today / Due in N days (todos, manual subscriptions)
 * - `invoice`: Overdue / Invoice today / Invoice in N days (auto-renew)
 */
export function calendarDueStatus(
  dueAt: string | null | undefined,
  now: string | Date = new Date(),
  vocabulary: DueStatusVocabulary = "due",
): DueStatus | null {
  if (!dueAt) return null;
  const due = dayjs(dueAt);
  if (!due.isValid()) return null;

  const days = due.startOf("day").diff(dayjs(now).startOf("day"), "day");
  if (days < 0) return { kind: "overdue", label: "Overdue" };
  if (days === 0) {
    return {
      kind: "today",
      label: vocabulary === "invoice" ? "Invoice today" : "Due today",
    };
  }
  const unit = days === 1 ? "day" : "days";
  const prefix = vocabulary === "invoice" ? "Invoice in" : "Due in";
  return {
    kind: "upcoming",
    label: `${prefix} ${days} ${unit}`,
  };
}
