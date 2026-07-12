import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  combineDateAndTime,
  dateToDateInput,
  dateToTimeInput,
  DEFAULT_DUE_TIME,
  normalizeTimeInput,
  parseDateTimeInput,
} from "@/lib/date";
import { cn } from "@/lib/utils";

function formatTriggerLabel(date: Date): string {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DateTimePicker({
  value,
  onChange,
  "aria-label": ariaLabel,
  placeholder = "Pick a date & time",
  clearable = false,
  className,
}: {
  /** Local datetime `YYYY-MM-DDTHH:mm:ss`, or empty string when unset. */
  value: string;
  onChange: (value: string) => void;
  "aria-label"?: string;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseDateTimeInput(value);
  const datePart = selected ? dateToDateInput(selected) : "";
  const timePart = selected ? dateToTimeInput(selected) : DEFAULT_DUE_TIME;
  const label = selected ? formatTriggerLabel(selected) : "";

  function commit(nextDate: string, nextTime: string) {
    const combined = combineDateAndTime(nextDate, nextTime);
    if (combined) onChange(combined);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={ariaLabel}
          className={cn(
            "w-full justify-start text-left font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
          data-empty={!selected}
          type="button"
          variant="outline"
        >
          <CalendarIcon />
          {selected ? label : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          defaultMonth={selected}
          mode="single"
          onSelect={(date) => {
            if (!date) {
              if (clearable) onChange("");
              return;
            }
            const nextDate = dateToDateInput(date);
            if (
              clearable &&
              selected &&
              nextDate === datePart &&
              timePart === dateToTimeInput(selected)
            ) {
              onChange("");
              setOpen(false);
              return;
            }
            // Keep the current clock when changing days; default to end-of-day.
            commit(nextDate, selected ? timePart : DEFAULT_DUE_TIME);
          }}
          selected={selected}
        />
        <div className="border-t border-border p-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Time</span>
            <Input
              aria-label={ariaLabel ? `${ariaLabel} time` : "Due time"}
              className="h-8"
              disabled={!datePart}
              onChange={(event) => {
                if (!datePart) return;
                const nextTime =
                  normalizeTimeInput(event.target.value) ?? event.target.value;
                // Allow intermediate typing; only commit valid times.
                if (normalizeTimeInput(event.target.value)) {
                  commit(datePart, nextTime);
                }
              }}
              step={1}
              type="time"
              value={timePart.slice(0, 8)}
            />
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}
