import { cn } from "@/lib/utils";
import {
  calendarDueStatus,
  type DueStatusKind,
  type DueStatusVocabulary,
} from "@/lib/due-status";

const DUE_STATUS_BADGE_CLASS: Record<DueStatusKind, string> = {
  overdue:
    "bg-rose-500/15 text-rose-700 dark:bg-rose-400/20 dark:text-rose-300",
  today:
    "bg-amber-500/20 text-amber-800 dark:bg-amber-400/20 dark:text-amber-200",
  upcoming: "bg-sky-500/15 text-sky-800 dark:bg-sky-400/20 dark:text-sky-200",
};

/** Colored relative-date chip (todos + subscriptions). */
export function DueStatusBadge({
  dueAt,
  inactive = false,
  vocabulary = "due",
}: {
  dueAt: string | null | undefined;
  /** When true (e.g. completed todo), hide the badge. */
  inactive?: boolean;
  /** Auto-renew subscriptions use invoice wording instead of "Due …". */
  vocabulary?: DueStatusVocabulary;
}) {
  if (inactive) return null;
  const status = calendarDueStatus(dueAt, new Date(), vocabulary);
  if (!status) return null;
  return (
    <span
      className={cn(
        "inline-flex w-fit whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-medium",
        DUE_STATUS_BADGE_CLASS[status.kind],
      )}
    >
      {status.label}
    </span>
  );
}
