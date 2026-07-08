import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

import { motionOrUndefined, switchThumbTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange" | "type"
> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * Accessible checkbox with a Motion-smoothed check glyph. Drop-in for list rows that
 * previously used a native `<input type="checkbox">`.
 */
export function Checkbox({
  checked,
  onCheckedChange,
  className,
  disabled,
  onClick,
  ...rest
}: CheckboxProps) {
  const reduce = useReducedMotion();

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border border-input bg-background text-primary-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-primary bg-primary" : "bg-background",
        className,
      )}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onCheckedChange(!checked);
      }}
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
        <motion.path
          d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{
            pathLength: checked ? 1 : 0,
            opacity: checked ? 1 : 0,
          }}
          transition={
            motionOrUndefined(reduce, switchThumbTransition) ?? { duration: 0 }
          }
        />
      </svg>
    </button>
  );
}
