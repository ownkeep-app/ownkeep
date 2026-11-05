export function pageCountFor(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** The items on a 1-based page. */
export function pageSlice<T>(items: T[], page: number, pageSize: number): T[] {
  return items.slice((page - 1) * pageSize, page * pageSize);
}

export const PAGE_GAP = "gap";

/** Page buttons to show: the first, the last, and the current page's neighbours, with gaps between. */
export function visiblePages(
  current: number,
  count: number,
): (number | typeof PAGE_GAP)[] {
  const pages: (number | typeof PAGE_GAP)[] = [];
  for (let page = 1; page <= count; page += 1) {
    if (page === 1 || page === count || Math.abs(page - current) <= 1) {
      pages.push(page);
    } else if (pages[pages.length - 1] !== PAGE_GAP) {
      pages.push(PAGE_GAP);
    }
  }
  return pages;
}
