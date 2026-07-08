import { CreditCard } from "lucide-react";

import type { FeatureModule } from "@/modules/types";
import {
  SubscriptionDetailView,
  SubscriptionEditView,
  SubscriptionsListView,
} from "./SubscriptionsModule";
import {
  buildSubscriptionIndex,
  collectSubscriptionReminders,
  isSubscriptionEntry,
  subscriptionEntries,
} from "./logic";
import { SUBSCRIPTIONS_MODULE_ID } from "./types";

export const subscriptionsModule: FeatureModule = {
  id: SUBSCRIPTIONS_MODULE_ID,
  title: "Subscriptions",
  icon: <CreditCard className="h-4 w-4" />,
  enabledByDefault: true,
  scopePrefix: "s",
  createEmpty: () => [],
  buildIndex: (items) => buildSubscriptionIndex(subscriptionEntries(items)),
  ListView: ({ items }) => (
    <SubscriptionsListView items={subscriptionEntries(items)} />
  ),
  DetailView: ({ item }) =>
    isSubscriptionEntry(item) ? <SubscriptionDetailView item={item} /> : null,
  EditView: ({ item, onSave, onCancel }) => (
    <SubscriptionEditView
      item={isSubscriptionEntry(item) ? item : undefined}
      onCancel={onCancel}
      onSave={onSave}
    />
  ),
  collectReminders: collectSubscriptionReminders,
};
