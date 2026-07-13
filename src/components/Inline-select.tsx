import { type ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type InlineSelectOption = string | { value: string; label?: string };

function normalizeOptions(
  options: readonly InlineSelectOption[],
): { value: string; label: string }[] {
  return options.map((option) =>
    typeof option === "string"
      ? { value: option, label: option }
      : { value: option.value, label: option.label ?? option.value },
  );
}

/**
 * List-cell control: click opens a dropdown menu to pick a new value
 * (category, priority, cycle, etc.) — one click to choose.
 */
export function InlineSelect({
  value,
  options,
  onChange,
  display,
  "aria-label": ariaLabel,
  className,
}: {
  value: string;
  options: readonly InlineSelectOption[];
  onChange: (value: string) => void | Promise<void>;
  display: ReactNode;
  "aria-label": string;
  className?: string;
}) {
  const resolved = normalizeOptions(options);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={ariaLabel}
          className={cn(
            "max-w-full rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            className,
          )}
          type="button"
        >
          {display}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          onValueChange={(next) => {
            if (next !== value) void onChange(next);
          }}
          value={value}
        >
          {resolved.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
