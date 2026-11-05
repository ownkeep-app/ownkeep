import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { PAGE_GAP, pageCountFor, visiblePages } from "@/lib/pagination";

/** Which items are showing, plus previous / numbered / next page buttons. */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  /** 1-based. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useT();
  const count = pageCountFor(total, pageSize);

  return (
    <nav
      aria-label={t("pagination.label")}
      className="flex items-center justify-between gap-3"
    >
      <p className="text-xs tabular-nums text-muted-foreground">
        {t("pagination.range", {
          from: (page - 1) * pageSize + 1,
          to: Math.min(page * pageSize, total),
          total,
        })}
      </p>
      <div className="flex items-center gap-1">
        <Button
          aria-label={t("pagination.previous")}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {visiblePages(page, count).map((entry, index) =>
          entry === PAGE_GAP ? (
            <span
              aria-hidden="true"
              className="w-6 text-center text-sm text-muted-foreground"
              key={`gap-${index}`}
            >
              …
            </span>
          ) : (
            <Button
              aria-current={entry === page ? "page" : undefined}
              aria-label={t("pagination.goTo", { page: entry })}
              key={entry}
              onClick={() => onPageChange(entry)}
              size="icon"
              type="button"
              variant={entry === page ? "default" : "ghost"}
            >
              {entry}
            </Button>
          ),
        )}
        <Button
          aria-label={t("pagination.next")}
          disabled={page >= count}
          onClick={() => onPageChange(page + 1)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
