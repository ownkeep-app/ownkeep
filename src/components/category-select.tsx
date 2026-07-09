import { Select, type SelectProps } from "@/components/ui/select";
import {
  DEFAULT_CATEGORY,
  optionsWithExtras,
} from "@/vault/taxonomy";

export function CategorySelect({
  "aria-label": ariaLabel,
  options,
  value,
  ...props
}: Omit<SelectProps, "children"> & {
  options: readonly string[];
}) {
  const current =
    typeof value === "string" && value.trim() ? value.trim() : DEFAULT_CATEGORY;
  const merged = optionsWithExtras(options, current);

  return (
    <Select aria-label={ariaLabel} value={current} {...props}>
      {merged.map((category) => (
        <option key={category} value={category}>
          {category}
        </option>
      ))}
    </Select>
  );
}
