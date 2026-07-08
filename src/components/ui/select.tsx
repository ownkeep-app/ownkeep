import * as React from "react";
import { motion, type HTMLMotionProps, useReducedMotion } from "motion/react";

import { fadeTransition, motionOrUndefined } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type SelectProps = HTMLMotionProps<"select">;

/**
 * Native `<select>` styled to match the Input primitive, with a light focus scale so Settings /
 * form enums feel consistent with the rest of the Motion polish pass.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    const reduce = useReducedMotion();

    return (
      <motion.select
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
        whileFocus={motionOrUndefined(reduce, { scale: 1.005 })}
        transition={fadeTransition}
      >
        {children}
      </motion.select>
    );
  },
);
Select.displayName = "Select";
