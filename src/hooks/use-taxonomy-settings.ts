import { useVaultStore } from "@/stores/vault-store";
import {
  defaultCategoryOptions,
  defaultTagOptions,
  resolveCategoryOptions,
  resolveTagOptions,
  type TaxonomySettings,
} from "@/vault/taxonomy";

export function useTaxonomySettings(): {
  categoryOptions: string[];
  tagOptions: string[];
  taxonomy: TaxonomySettings | undefined;
} {
  const settings = useVaultStore((state) => state.model?.settings);
  return {
    categoryOptions: settings
      ? resolveCategoryOptions(settings)
      : defaultCategoryOptions(),
    tagOptions: settings ? resolveTagOptions(settings) : defaultTagOptions(),
    taxonomy: settings,
  };
}
