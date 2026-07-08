import { motion, useReducedMotion } from "motion/react";

import { motionOrUndefined, switchThumbTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  "aria-label"?: string;
}

/** A minimal accessible toggle (role="switch") — avoids pulling in a Radix dependency. */
export function Switch({ checked, onCheckedChange, ...rest }: SwitchProps) {
  const reduce = useReducedMotion();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-input",
      )}
      {...rest}
    >
      <motion.span
        className="inline-block h-4 w-4 rounded-full bg-background"
        animate={{ x: checked ? 16 : 2 }}
        transition={
          motionOrUndefined(reduce, switchThumbTransition) ?? {
            duration: 0,
          }
        }
      />
    </button>
  );
}
