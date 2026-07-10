import { motion, useReducedMotion } from "motion/react";
import * as React from "react";

import { fadeTransition, motionOrUndefined } from "@/lib/motion";
import { cn } from "@/lib/utils";

type ButtonGroupRole = "radiogroup" | "tablist";

export interface ButtonGroupOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  controls?: string;
}

export function ButtonGroup<T extends string>({
  "aria-label": ariaLabel,
  className,
  onValueChange,
  options,
  role = "radiogroup",
  value,
}: {
  "aria-label": string;
  className?: string;
  onValueChange: (value: T) => void;
  options: ButtonGroupOption<T>[];
  role?: ButtonGroupRole;
  value: T;
}) {
  const reduce = useReducedMotion();
  const groupId = React.useId();

  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        "inline-flex w-fit gap-1 overflow-hidden rounded-md border border-border bg-muted/40 p-1",
        className,
      )}
      role={role}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            aria-checked={role === "radiogroup" ? active : undefined}
            aria-controls={option.controls}
            aria-selected={role === "tablist" ? active : undefined}
            className={cn(
              "relative inline-flex h-8 min-w-0 items-center justify-center gap-2 rounded-sm px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            disabled={option.disabled}
            key={option.value}
            onClick={() => onValueChange(option.value)}
            role={role === "tablist" ? "tab" : "radio"}
            type="button"
          >
            {active && (
              <motion.span
                className="absolute inset-0 rounded-sm bg-border dark:bg-muted"
                layoutId={`${groupId}-button-group-active`}
                transition={fadeTransition}
                {...motionOrUndefined(reduce, { layout: true })}
              />
            )}
            <span className="relative z-10 inline-flex min-w-0 items-center gap-2">
              {option.icon}
              <span className="truncate">{option.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
