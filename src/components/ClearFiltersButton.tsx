import { Button } from "@/components/ui/button";

/** Shown beside list filter controls when a non-default filter is active. */
export function ClearFiltersButton({ onClear }: { onClear: () => void }) {
  return (
    <Button
      className="shrink-0"
      onClick={onClear}
      size="sm"
      type="button"
      variant="outline"
    >
      Clear Filters
    </Button>
  );
}
