export type SortDirection = "asc" | "desc";

export interface SortState<Column extends string> {
  column: Column;
  direction: SortDirection;
}

export type SortValue = string | number | boolean | Date | null | undefined;

export function nextSortState<Column extends string>(
  current: SortState<Column> | null,
  column: Column,
): SortState<Column> {
  if (current?.column !== column) return { column, direction: "asc" };
  return {
    column,
    direction: current.direction === "asc" ? "desc" : "asc",
  };
}

export function stableSortBy<T, Column extends string>(
  items: readonly T[],
  sort: SortState<Column>,
  readValue: (item: T, column: Column) => SortValue,
): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const diff = compareSortValues(
        readValue(left.item, sort.column),
        readValue(right.item, sort.column),
      );
      if (diff !== 0) return sort.direction === "asc" ? diff : -diff;
      return left.index - right.index;
    })
    .map(({ item }) => item);
}

function compareSortValues(left: SortValue, right: SortValue): number {
  const normalizedLeft = normalizeSortValue(left);
  const normalizedRight = normalizeSortValue(right);

  if (normalizedLeft === null && normalizedRight === null) return 0;
  if (normalizedLeft === null) return 1;
  if (normalizedRight === null) return -1;

  if (
    typeof normalizedLeft === "number" &&
    typeof normalizedRight === "number"
  ) {
    return normalizedLeft - normalizedRight;
  }

  if (
    typeof normalizedLeft === "boolean" &&
    typeof normalizedRight === "boolean"
  ) {
    return Number(normalizedLeft) - Number(normalizedRight);
  }

  return String(normalizedLeft).localeCompare(
    String(normalizedRight),
    undefined,
    {
      numeric: true,
      sensitivity: "base",
    },
  );
}

function normalizeSortValue(
  value: SortValue,
): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : time;
  }
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  return value;
}
