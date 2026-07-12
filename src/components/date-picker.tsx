import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { dateToDateInput, parseDateInput } from "@/lib/date";
import { cn } from "@/lib/utils";

function formatLocalDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DatePicker({
  value,
  onChange,
  "aria-label": ariaLabel,
  placeholder = "Pick a date",
  clearable = false,
  className,
}: {
  /** Calendar date `YYYY-MM-DD`, or empty string when unset. */
  value: string;
  onChange: (value: string) => void;
  "aria-label"?: string;
  placeholder?: string;
  /** When true, selecting the same day again clears the value. */
  clearable?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseDateInput(value);

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
          {selected ? formatLocalDate(selected) : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          defaultMonth={selected}
          mode="single"
          onSelect={(date) => {
            if (!date) {
              if (clearable) onChange("");
              setOpen(false);
              return;
            }
            const next = dateToDateInput(date);
            if (clearable && next === value) {
              onChange("");
            } else {
              onChange(next);
            }
            setOpen(false);
          }}
          selected={selected}
        />
      </PopoverContent>
    </Popover>
  );
}
