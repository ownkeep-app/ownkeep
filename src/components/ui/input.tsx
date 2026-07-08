import * as React from "react";
import { motion, type HTMLMotionProps, useReducedMotion } from "motion/react";

import { fadeTransition, motionOrUndefined } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type InputProps = HTMLMotionProps<"input">;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    const reduce = useReducedMotion();

    return (
      <motion.input
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        type={type}
        {...props}
        whileFocus={motionOrUndefined(reduce, { scale: 1.005 })}
        transition={fadeTransition}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
