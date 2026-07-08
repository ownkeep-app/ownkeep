import type { ReactNode } from "react";

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
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
      <div className="flex flex-col items-center gap-3">
        <p className="font-medium text-foreground">{title}</p>
        <p className="max-w-xs">{description}</p>
        {action}
      </div>
    </div>
  );
}
