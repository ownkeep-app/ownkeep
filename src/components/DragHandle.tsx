import type { ComponentProps } from "react";

import { GripVertical } from "lucide-react";

import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/** Classes for a sortable item: fade the one being dragged and outline where it would land. */
export const SORTABLE_ITEM_CLASS =
  "data-[dragging=true]:opacity-50 data-[drop-target=true]:ring-2 data-[drop-target=true]:ring-primary";

/** The grip that drags an item to a new place; arrow keys do the same (see `useDragSort`). */
export function DragHandle({
  itemName,
  className,
  ...props
}: ComponentProps<"button"> & { itemName: string }) {
  const { t } = useT();
  return (
    <button
      aria-label={t("common.dragToSort", { name: itemName })}
      className={cn(
        "flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:cursor-grabbing",
        className,
      )}
      title={t("common.dragToSortHint")}
      type="button"
      {...props}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}
