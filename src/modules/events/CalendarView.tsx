import { useMemo, useState } from "react";

import { ChevronLeft, ChevronRight, Flag, Paperclip } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TagIcon } from "./icons";
import { ItemLine } from "./ItemLine";
import {
  dayFor,
  eventYears,
  formatTagValue,
  isInMonth,
  monthGrid,
  monthOf,
  shiftMonth,
  todayKey,
  trackedTagValues,
} from "./logic";
import type { TrackedEvent } from "./types";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_ITEMS_PER_CELL = 3;
const MONTH_INDEXES = Array.from({ length: 12 }, (_, month) => month);

function monthName(month: number): string {
  return new Date(2000, month, 1).toLocaleDateString(undefined, {
    month: "short",
  });
}

export function CalendarView({
  event,
  onOpenDay,
}: {
  event: TrackedEvent;
  onOpenDay: (date: string) => void;
}) {
  const today = todayKey();
  const [cursor, setCursor] = useState(() => monthOf(today));
  const weeks = useMemo(() => monthGrid(cursor), [cursor]);
  // Event's first year → this year; also the viewed year if arrows took it outside that span.
  const years = [...new Set([...eventYears(event, today), cursor.year])].sort(
    (left, right) => right - left,
  );
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric" },
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2
          className="min-w-0 flex-1 text-base font-semibold"
          aria-live="polite"
        >
          {monthLabel}
        </h2>
        <Select
          aria-label="Jump to year"
          className="w-24"
          onChange={(change) =>
            setCursor((current) => ({
              ...current,
              year: Number(change.target.value),
            }))
          }
          value={cursor.year}
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Jump to month"
          className="w-24"
          onChange={(change) =>
            setCursor((current) => ({
              ...current,
              month: Number(change.target.value),
            }))
          }
          value={cursor.month}
        >
          {MONTH_INDEXES.map((month) => (
            <option key={month} value={month}>
              {monthName(month)}
            </option>
          ))}
        </Select>
        <Button
          onClick={() => setCursor(monthOf(today))}
          size="sm"
          type="button"
          variant="outline"
        >
          Today
        </Button>
        <Button
          aria-label="Previous month"
          onClick={() => setCursor((current) => shiftMonth(current, -1))}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          aria-label="Next month"
          onClick={() => setCursor((current) => shiftMonth(current, 1))}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="sticky top-0 z-10 grid grid-cols-7 border-b border-border bg-background pb-1 text-xs font-medium uppercase text-muted-foreground">
          {WEEKDAY_LABELS.map((label) => (
            <span className="px-2" key={label}>
              {label}
            </span>
          ))}
        </div>
        <div
          aria-label={monthLabel}
          className="grid flex-1 auto-rows-[minmax(6.5rem,1fr)] grid-cols-7"
          role="grid"
        >
          {weeks.flat().map((date) => (
            <DayCell
              date={date}
              event={event}
              inMonth={isInMonth(date, cursor)}
              isToday={date === today}
              key={date}
              onOpen={() => onOpenDay(date)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DayCell({
  event,
  date,
  inMonth,
  isToday,
  onOpen,
}: {
  event: TrackedEvent;
  date: string;
  inMonth: boolean;
  isToday: boolean;
  onOpen: () => void;
}) {
  const day = dayFor(event, date);
  const tags = day ? trackedTagValues(event, day) : [];
  const items = day?.items ?? [];
  const milestone = Boolean(day?.milestone);
  const attachmentCount = items.reduce(
    (total, item) => total + item.images.length,
    0,
  );
  const hiddenItems = items.length - MAX_ITEMS_PER_CELL;

  return (
    <button
      aria-label={`${date}${day ? ", tracked" : ""}${milestone ? ", milestone" : ""}`}
      className={cn(
        "flex min-w-0 flex-col gap-1 overflow-hidden [&>*]:shrink-0 border-b border-r border-border p-1.5 text-left text-xs transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring [&:nth-child(7n+1)]:border-l",
        !inMonth && "bg-muted/30 text-muted-foreground",
        day && "bg-primary/5",
        milestone &&
          "bg-amber-50 shadow-[inset_0_0_0_2px_theme(colors.amber.400)] dark:bg-amber-400/10",
      )}
      onClick={onOpen}
      role="gridcell"
      type="button"
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm",
            isToday && "bg-primary font-semibold text-primary-foreground",
          )}
        >
          {Number(date.slice(8))}
        </span>
        {milestone ? (
          <Flag
            aria-label="Milestone"
            className="mr-auto ml-1 h-3.5 w-3.5 fill-current text-amber-500"
          />
        ) : null}
        {attachmentCount > 0 ? (
          <span className="inline-flex items-center gap-0.5 text-muted-foreground">
            <Paperclip className="h-3 w-3" />
            {attachmentCount}
          </span>
        ) : null}
      </div>
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {tags.map(({ tag, value }) => (
            <span
              className="inline-flex max-w-full items-center gap-0.5 rounded bg-secondary px-1 py-0.5 text-secondary-foreground"
              key={tag.id}
              title={tag.name}
            >
              <TagIcon className="h-3 w-3" icon={tag.icon} />
              <span className="truncate">{formatTagValue(tag, value)}</span>
            </span>
          ))}
        </div>
      ) : null}
      {items.slice(0, MAX_ITEMS_PER_CELL).map((item) => (
        <ItemLine item={item} key={item.id} />
      ))}
      {hiddenItems > 0 ? (
        <span className="text-muted-foreground">+{hiddenItems} more</span>
      ) : null}
      {day?.note ? (
        <p
          className="line-clamp-2 whitespace-pre-line break-words rounded bg-muted/70 px-1 py-0.5 text-muted-foreground"
          title={day.note}
        >
          {day.note}
        </p>
      ) : null}
    </button>
  );
}
