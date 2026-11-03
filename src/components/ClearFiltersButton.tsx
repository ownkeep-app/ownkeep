import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

/** Shown beside list filter controls when a non-default filter is active. */
export function ClearFiltersButton({ onClear }: { onClear: () => void }) {
  const { t } = useT();
  return (
    <Button
      className="shrink-0"
      onClick={onClear}
      size="sm"
      type="button"
      variant="outline"
    >
      {t("common.clearFilters")}
    </Button>
  );
}
