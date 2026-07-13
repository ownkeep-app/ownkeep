import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Primary list label that opens the same detail view as the row ⋮ View action. */
export function ListItemTitle({
  children,
  onOpen,
  className,
}: {
  children: ReactNode;
  onOpen: () => void;
  className?: string;
}) {
  return (
    <button
      className={cn(
        "max-w-full text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
      onClick={onOpen}
      type="button"
    >
      {children}
    </button>
  );
}
