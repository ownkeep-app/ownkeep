import type { EventItem } from "./types";

/** One item in a calendar cell or timeline card: name on the left, value on the right. */
export function ItemLine({ item }: { item: EventItem }) {
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {item.label}
      </span>
      {item.value ? (
        // Capped so a long value can't squeeze the name out entirely.
        <span className="max-w-[60%] shrink-0 truncate text-right">
          {item.value}
        </span>
      ) : null}
    </span>
  );
}
