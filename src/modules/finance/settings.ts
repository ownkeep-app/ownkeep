import { parseOptionLines } from "@/vault/taxonomy";
import type { VaultSettings } from "@/vault/model";
import { FINANCE_MODULE_ID } from "./types";

/** Default holders for finance holdings (editable in Finance settings). */
export const DEFAULT_HOLDER_OPTIONS = [
  "Me",
  "Wife",
  "Child",
  "Parent",
] as const;

/** Default asset categories for finance holdings (editable in Finance settings). */
export const DEFAULT_FINANCE_CATEGORY_OPTIONS = [
  "Bank",
  "Crypto",
  "Real estate",
  "Stock",
  "Gold",
  "Lent",
  "E-wallet",
] as const;

export const DEFAULT_HOLDER = "Me";
export const DEFAULT_FINANCE_CATEGORY = "Bank";

export interface FinanceTaxonomy {
  holderOptions: string[];
  categoryOptions: string[];
}

export function defaultHolderOptions(): string[] {
  return [...DEFAULT_HOLDER_OPTIONS];
}

export function defaultFinanceCategoryOptions(): string[] {
  return [...DEFAULT_FINANCE_CATEGORY_OPTIONS];
}

function resolveOptionList(raw: unknown, defaults: string[]): string[] {
  if (!Array.isArray(raw)) return defaults;
  const options = Array.from(
    new Set(
      raw
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
  return options.length > 0 ? options : defaults;
}

/** Read finance-specific holder/category lists from settings (with defaults). */
export function readFinanceTaxonomy(settings: VaultSettings): FinanceTaxonomy {
  const finance = settings.modules[FINANCE_MODULE_ID];
  return {
    holderOptions: resolveOptionList(
      finance?.holderOptions,
      defaultHolderOptions(),
    ),
    categoryOptions: resolveOptionList(
      finance?.categoryOptions,
      defaultFinanceCategoryOptions(),
    ),
  };
}

export function defaultHolder(taxonomy?: FinanceTaxonomy): string {
  const options = taxonomy?.holderOptions.length
    ? taxonomy.holderOptions
    : defaultHolderOptions();
  if (options.includes(DEFAULT_HOLDER)) return DEFAULT_HOLDER;
  return options[0] || DEFAULT_HOLDER;
}

export function defaultFinanceCategory(taxonomy?: FinanceTaxonomy): string {
  const options = taxonomy?.categoryOptions.length
    ? taxonomy.categoryOptions
    : defaultFinanceCategoryOptions();
  if (options.includes(DEFAULT_FINANCE_CATEGORY))
    return DEFAULT_FINANCE_CATEGORY;
  return options[0] || DEFAULT_FINANCE_CATEGORY;
}

/** Parse / normalize option lists typed in Finance settings (one label per line). */
export function parseFinanceOptionLines(text: string): string[] {
  return parseOptionLines(text);
}
