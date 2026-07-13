import dayjs from "dayjs";

/** Calendar-day due urgency (null when undated or invalid). */
export type DueStatusKind = "overdue" | "today" | "upcoming";

export interface DueStatus {
  kind: DueStatusKind;
  label: string;
}

/**
 * Relative due badge: Overdue / Due today / Due in N days.
 * Compares calendar days in the local timezone (not wall-clock hours).
 */
export function calendarDueStatus(
  dueAt: string | null | undefined,
  now: string | Date = new Date(),
): DueStatus | null {
  if (!dueAt) return null;
  const due = dayjs(dueAt);
  if (!due.isValid()) return null;

  const days = due.startOf("day").diff(dayjs(now).startOf("day"), "day");
  if (days < 0) return { kind: "overdue", label: "Overdue" };
  if (days === 0) return { kind: "today", label: "Due today" };
  return {
    kind: "upcoming",
    label: days === 1 ? "Due in 1 day" : `Due in ${days} days`,
  };
}
