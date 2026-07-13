import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { optionsWithExtras } from "@/vault/taxonomy";

/** Empty value = no category filter (show all). */
export const ALL_CATEGORIES_FILTER = "";

/** Settings options plus any categories present on list items. */
export function categoryFilterOptions(
  settingsOptions: readonly string[],
  itemCategories: readonly string[],
): string[] {
  const uniqueItemCategories = Array.from(
    new Set(
      itemCategories.map((category) => category.trim()).filter(Boolean),
    ),
  );
  return optionsWithExtras(settingsOptions, uniqueItemCategories);
}

/** Dashboard list filter: All categories, or one category. */
export function CategoryFilterSelect({
  options,
  value,
  onChange,
  "aria-label": ariaLabel = "Filter by category",
  className,
}: {
  options: readonly string[];
  value: string;
  onChange: (category: string) => void;
  "aria-label"?: string;
  className?: string;
}) {
  return (
    <Select
      aria-label={ariaLabel}
      className={cn("w-full shrink-0 sm:w-44", className)}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      <option value={ALL_CATEGORIES_FILTER}>All categories</option>
      {options.map((category) => (
        <option key={category} value={category}>
          {category}
        </option>
      ))}
    </Select>
  );
}
