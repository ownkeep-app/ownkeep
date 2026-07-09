import type { VaultSettings } from "@/vault/model";

/** Built-in category labels; users can customize the list in Settings. */
export const DEFAULT_CATEGORY_OPTIONS = [
  "Work",
  "Personal",
  "Dev",
  "Finance",
  "Casual",
  "Misc",
] as const;

/** Built-in tag labels; users can customize the list in Settings. */
export const DEFAULT_TAG_OPTIONS = [
  "React",
  "Bash",
  "Git",
  "TypeScript",
  "AI",
  "MongoDB",
  "PostgreSQL",
  "CSS",
  "HTML",
  "JavaScript",
  "Network",
  "Crypto",
] as const;

export const DEFAULT_CATEGORY = "Personal";
export const DEFAULT_TAG = "React";

export type TaxonomySettings = Pick<
  VaultSettings,
  "categoryOptions" | "tagOptions"
>;

export function defaultCategoryOptions(): string[] {
  return [...DEFAULT_CATEGORY_OPTIONS];
}

export function defaultTagOptions(): string[] {
  return [...DEFAULT_TAG_OPTIONS];
}

export function parseOptionLines(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  );
}

export function optionsWithExtras(
  options: readonly string[],
  current: string | readonly string[],
): string[] {
  const values = Array.isArray(current) ? current : [current];
  const extras = values
    .map((value) => value.trim())
    .filter((value) => value && !options.includes(value));
  return [...options, ...extras];
}

export function normalizeTags(tags: readonly string[]): string[] {
  return Array.from(
    new Set(tags.map((tag) => tag.trim()).filter(Boolean)),
  );
}

export function resolveCategoryOptions(settings?: TaxonomySettings): string[] {
  return settings?.categoryOptions?.length
    ? settings.categoryOptions
    : defaultCategoryOptions();
}

export function resolveTagOptions(settings?: TaxonomySettings): string[] {
  return settings?.tagOptions?.length
    ? settings.tagOptions
    : defaultTagOptions();
}

export function defaultCategory(settings?: TaxonomySettings): string {
  const options = resolveCategoryOptions(settings);
  if (options.includes(DEFAULT_CATEGORY)) return DEFAULT_CATEGORY;
  return options[0] ?? DEFAULT_CATEGORY;
}

export function defaultTags(settings?: TaxonomySettings): string[] {
  const options = resolveTagOptions(settings);
  if (options.includes(DEFAULT_TAG)) return [DEFAULT_TAG];
  return options[0] ? [options[0]] : [];
}

export function withTaxonomyDefaults(
  settings: Partial<VaultSettings> | undefined,
  base: VaultSettings,
): VaultSettings {
  const merged = {
    ...base,
    ...(settings ?? {}),
    modules: { ...(settings?.modules ?? {}) },
  };
  return {
    ...merged,
    categoryOptions: merged.categoryOptions?.length
      ? merged.categoryOptions
      : base.categoryOptions,
    tagOptions: merged.tagOptions?.length
      ? merged.tagOptions
      : base.tagOptions,
  };
}
