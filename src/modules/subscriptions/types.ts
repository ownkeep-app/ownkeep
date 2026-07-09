export const SUBSCRIPTIONS_MODULE_ID = "subscriptions";
export const DEFAULT_SUBSCRIPTION_LEAD_DAYS = 3;

export const SUBSCRIPTION_CYCLES = [
  "weekly",
  "monthly",
  "yearly",
  "custom",
] as const;

export type SubscriptionCycle = (typeof SUBSCRIPTION_CYCLES)[number];

export interface SubscriptionEntry {
  id: string;
  service: string;
  url: string;
  amount: number;
  currency: string;
  cycle: SubscriptionCycle;
  customIntervalDays: number | null;
  nextDueDate: string;
  autoRenew: boolean;
  notifyLeadDays: number;
  notes: string;
  category: string;
  tags: string[];
  updatedAt: string;
}

export interface SubscriptionFormInput {
  service: string;
  url: string;
  amount: string;
  currency: string;
  cycle: SubscriptionCycle;
  customIntervalDays: string;
  nextDueDate: string;
  autoRenew: boolean;
  notifyLeadDays: string;
  notes: string;
  category: string;
  tags: string[];
}
