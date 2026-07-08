import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

import { fadeTransition, motionOrUndefined } from "@/lib/motion";

/**
 * Shared friendly empty state for the Dashboard module panes (spec §7.5: "every module ships a
 * `ListView`; an empty module shows a friendly empty state + New"). Modules distinguish a
 * truly-empty slice (offer the New action) from a filtered-empty result (suggest clearing the
 * filter).
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground"
      // Never render hidden at mount; keep Motion polish subtle.
      initial={false}
      animate={motionOrUndefined(reduce, { y: 0 }) ?? undefined}
      transition={fadeTransition}
    >
      <div className="flex flex-col items-center gap-3">
        <p className="font-medium text-foreground">{title}</p>
        <p className="max-w-xs">{description}</p>
        {action}
      </div>
    </motion.div>
  );
}
