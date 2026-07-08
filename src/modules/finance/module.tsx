import { TrendingUp } from "lucide-react";

import type { FeatureModule } from "@/modules/types";
import { FinanceEditView, FinanceListView } from "./FinanceModule";
import { buildFinanceIndex, financeSnapshots, isSnapshot } from "./logic";
import { FINANCE_MODULE_ID } from "./types";

export const financeModule: FeatureModule = {
  id: FINANCE_MODULE_ID,
  title: "Finance",
  icon: <TrendingUp className="h-4 w-4" />,
  enabledByDefault: true,
  scopePrefix: "f",
  createEmpty: () => [],
  buildIndex: (items) => buildFinanceIndex(financeSnapshots(items)),
  ListView: ({ items }) => <FinanceListView items={financeSnapshots(items)} />,
  EditView: ({ item, onSave, onCancel }) => (
    <FinanceEditView
      item={isSnapshot(item) ? item : undefined}
      onCancel={onCancel}
      onSave={onSave}
    />
  ),
};
