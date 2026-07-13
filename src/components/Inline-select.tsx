import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { Select } from "@/components/ui/select";
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
 * List-cell control: shows static content until clicked, then a native select
 * to change the value (category, priority, etc.).
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
  const [editing, setEditing] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  const resolved = normalizeOptions(options);

  useEffect(() => {
    if (!editing) return;
    const el = selectRef.current;
    if (!el) return;
    el.focus();
    try {
      el.showPicker?.();
    } catch {
      // showPicker can throw if not triggered by user activation in some engines.
    }
  }, [editing]);

  if (!editing) {
    return (
      <button
        aria-label={ariaLabel}
        className={cn(
          "max-w-full rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          className,
        )}
        onClick={() => setEditing(true)}
        type="button"
      >
        {display}
      </button>
    );
  }

  return (
    <Select
      aria-label={ariaLabel}
      className="h-8 min-w-0"
      onBlur={() => setEditing(false)}
      onChange={(event) => {
        const next = event.target.value;
        setEditing(false);
        if (next !== value) void onChange(next);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setEditing(false);
        }
      }}
      ref={selectRef}
      value={value}
    >
      {resolved.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}
