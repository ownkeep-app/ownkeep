import { cn } from "@/lib/utils";

/**
 * Solid enough to carry white text on a card or over a thumbnail, in both themes. Listed in full so
 * Tailwind can see each class, and ordered so the built-in categories land on clearly different hues.
 */
const BADGE_COLORS = [
  "bg-emerald-700", // Finance
  "bg-indigo-600",
  "bg-rose-600", // Personal
  "bg-amber-700", // Dev
  "bg-teal-700",
  "bg-cyan-700", // Casual
  "bg-fuchsia-700",
  "bg-blue-600", // Work
  "bg-violet-600", // Misc
  "bg-orange-700",
];

/** Chosen because it gives each built-in category (see `DEFAULT_CATEGORY_OPTIONS`) its own colour. */
const HASH_MULTIPLIER = 33;

/** A category always gets the same colour, in every module and on every launch. */
function colorFor(category: string): string {
  let hash = 0;
  for (const character of category) {
    hash = (hash * HASH_MULTIPLIER + character.charCodeAt(0)) >>> 0;
  }
  return BADGE_COLORS[hash % BADGE_COLORS.length];
}

/** An item's category as a coloured pill. Renders nothing for an item with no category. */
export function CategoryBadge({
  category,
  className,
}: {
  category: string;
  className?: string;
}) {
  const name = category.trim();
  if (!name) return null;
  return (
    <span
      className={cn(
        "inline-block max-w-40 shrink-0 truncate rounded-full px-2 py-0.5 text-xs font-medium text-white",
        colorFor(name),
        className,
      )}
    >
      {name}
    </span>
  );
}
