import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { normalizeTags, optionsWithExtras } from "@/vault/taxonomy";

export function TagMultiSelect({
  "aria-label": ariaLabel,
  className,
  options,
  value,
  onChange,
}: {
  "aria-label": string;
  className?: string;
  options: readonly string[];
  value: readonly string[];
  onChange: (tags: string[]) => void;
}) {
  const selected = normalizeTags(value);
  const merged = optionsWithExtras(options, selected);

  function toggle(tag: string, checked: boolean) {
    const next = checked
      ? normalizeTags([...selected, tag])
      : selected.filter((entry) => entry !== tag);
    onChange(next);
  }

  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        "grid max-h-40 grid-cols-2 gap-x-3 gap-y-2 overflow-auto rounded-md border border-input bg-background p-3 sm:grid-cols-3",
        className,
      )}
      role="group"
    >
      {merged.map((tag) => (
        <label
          className="flex cursor-pointer items-center gap-2 text-sm font-normal"
          key={tag}
        >
          <Checkbox
            aria-label={tag}
            checked={selected.includes(tag)}
            onCheckedChange={(checked) => toggle(tag, checked === true)}
          />
          <span className="truncate">{tag}</span>
        </label>
      ))}
    </div>
  );
}
