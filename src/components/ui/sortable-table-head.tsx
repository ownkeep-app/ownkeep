import { ArrowDownUp, ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import type { SortState } from "@/lib/table-sort";
import { cn } from "@/lib/utils";

interface SortableTableHeadProps<Column extends string> {
  column: Column;
  label: string;
  sort: SortState<Column> | null;
  onSort: (column: Column) => void;
  className?: string;
  align?: "left" | "right";
}

export function SortableTableHead<Column extends string>({
  column,
  label,
  sort,
  onSort,
  className,
  align = "left",
}: SortableTableHeadProps<Column>) {
  const active = sort?.column === column;
  const direction = active ? sort.direction : undefined;
  const SortIcon =
    direction === "asc"
      ? ChevronUp
      : direction === "desc"
        ? ChevronDown
        : ArrowDownUp;
  const ariaSort =
    direction === "asc"
      ? "ascending"
      : direction === "desc"
        ? "descending"
        : "none";
  const nextDirection =
    active && direction === "asc" ? "descending" : "ascending";

  return (
    <TableHead aria-sort={ariaSort} className={className} scope="col">
      <Button
        aria-label={`Sort ${label} ${nextDirection}`}
        className={cn(
          "-ml-2 h-7 whitespace-nowrap px-2 text-xs font-medium uppercase text-muted-foreground hover:text-foreground",
          align === "right" && "ml-auto -mr-2",
        )}
        onClick={() => onSort(column)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <span>{label}</span>
        <SortIcon
          aria-hidden="true"
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            active ? "opacity-100" : "opacity-45",
          )}
        />
      </Button>
    </TableHead>
  );
}

export function ActionsTableHead({ className }: { className?: string }) {
  return (
    <TableHead className={cn("w-12 px-2 text-right", className)} scope="col">
      <span className="sr-only">Actions</span>
    </TableHead>
  );
}
