import type { IndexEntry, ReminderEvent } from "@/modules/types";
import type { VaultSettings } from "@/vault/model";
import {
  defaultCategory,
  defaultTags,
  normalizeTags,
  type TaxonomySettings,
} from "@/vault/taxonomy";
import {
  DEFAULT_SUBSCRIPTION_LEAD_DAYS,
  SUBSCRIPTION_CYCLES,
  SUBSCRIPTIONS_MODULE_ID,
  type SubscriptionCycle,
  type SubscriptionEntry,
  type SubscriptionFormInput,
} from "./types";

const DAY_MS = 86_400_000;

export interface CurrencyTotal {
  currency: string;
  monthly: number;
  annual: number;
}

export interface ConvertedSubscriptionTotal {
  currency: string;
  monthly: number;
  annual: number;
  missingCurrencies: string[];
}

export interface SubscriptionSummary {
  rawTotals: CurrencyTotal[];
  converted: ConvertedSubscriptionTotal | null;
}

export function isSubscriptionCycle(
  value: unknown,
): value is SubscriptionCycle {
  return SUBSCRIPTION_CYCLES.includes(value as SubscriptionCycle);
}

export function isSubscriptionEntry(
  value: unknown,
): value is SubscriptionEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<SubscriptionEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.service === "string" &&
    typeof entry.url === "string" &&
    typeof entry.amount === "number" &&
    typeof entry.currency === "string" &&
    isSubscriptionCycle(entry.cycle) &&
    (typeof entry.customIntervalDays === "number" ||
      entry.customIntervalDays === null) &&
    typeof entry.nextDueDate === "string" &&
    typeof entry.autoRenew === "boolean" &&
    typeof entry.notifyLeadDays === "number" &&
    typeof entry.notes === "string" &&
    typeof entry.category === "string" &&
    Array.isArray(entry.tags) &&
    entry.tags.every((tag) => typeof tag === "string") &&
    typeof entry.updatedAt === "string"
  );
}

export function subscriptionEntries(items: unknown[]): SubscriptionEntry[] {
  return items.filter(isSubscriptionEntry);
}

export function buildSubscriptionIndex(
  items: SubscriptionEntry[],
): IndexEntry[] {
  return items.map((item) => ({
    id: item.id,
    moduleId: SUBSCRIPTIONS_MODULE_ID,
    type: "subscription",
    searchString: [
      item.service,
      item.url,
      item.currency,
      item.cycle,
      item.nextDueDate,
      item.notes,
      item.category,
      item.tags.join(" "),
    ]
      .filter(Boolean)
      .join(" "),
    displayLine: `${item.service} - ${formatCurrencyAmount(
      item.amount,
      item.currency,
    )} ${cycleLabel(item.cycle)} - due ${formatDate(item.nextDueDate)}`,
  }));
}

export function emptySubscriptionForm(
  settings?: TaxonomySettings,
): SubscriptionFormInput {
  return {
    service: "",
    url: "",
    amount: "",
    currency: "CNY",
    cycle: "monthly",
    customIntervalDays: "",
    nextDueDate: "",
    autoRenew: true,
    notifyLeadDays: String(DEFAULT_SUBSCRIPTION_LEAD_DAYS),
    notes: "",
    category: defaultCategory(settings),
    tags: defaultTags(settings),
  };
}

export function formFromSubscription(
  item: SubscriptionEntry,
): SubscriptionFormInput {
  return {
    service: item.service,
    url: item.url,
    amount: String(item.amount),
    currency: item.currency,
    cycle: item.cycle,
    customIntervalDays:
      item.customIntervalDays === null ? "" : String(item.customIntervalDays),
    nextDueDate: isoToDateInput(item.nextDueDate),
    autoRenew: item.autoRenew,
    notifyLeadDays: String(item.notifyLeadDays),
    notes: item.notes,
    category: item.category,
    tags: [...item.tags],
  };
}

export function createSubscriptionEntry(
  input: SubscriptionFormInput,
  now: string,
  id: string = crypto.randomUUID(),
): SubscriptionEntry {
  return normalizeSubscriptionEntry(
    {
      id,
      service: input.service,
      url: input.url,
      amount: parseAmount(input.amount),
      currency: normalizeCurrency(input.currency),
      cycle: input.cycle,
      customIntervalDays: parseCustomIntervalDays(
        input.customIntervalDays,
        input.cycle,
      ),
      nextDueDate: dateInputToIso(input.nextDueDate) ?? now,
      autoRenew: input.autoRenew,
      notifyLeadDays: parseLeadDays(input.notifyLeadDays),
      notes: input.notes,
      category: input.category.trim(),
      tags: normalizeTags(input.tags),
      updatedAt: now,
    },
    now,
  );
}

export function updateSubscriptionEntry(
  existing: SubscriptionEntry,
  input: SubscriptionFormInput,
  now: string,
): SubscriptionEntry {
  return normalizeSubscriptionEntry(
    {
      ...existing,
      service: input.service,
      url: input.url,
      amount: parseAmount(input.amount),
      currency: normalizeCurrency(input.currency),
      cycle: input.cycle,
      customIntervalDays: parseCustomIntervalDays(
        input.customIntervalDays,
        input.cycle,
      ),
      nextDueDate: dateInputToIso(input.nextDueDate) ?? existing.nextDueDate,
      autoRenew: input.autoRenew,
      notifyLeadDays: parseLeadDays(input.notifyLeadDays),
      notes: input.notes,
      category: input.category.trim(),
      tags: normalizeTags(input.tags),
      updatedAt: now,
    },
    now,
  );
}

export function validateSubscriptionInput(
  input: SubscriptionFormInput,
): string | null {
  if (!input.service.trim()) return "Service is required.";
  if (!input.category.trim()) return "Category is required.";
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return "Amount must be zero or greater.";
  }
  if (!input.currency.trim()) return "Currency is required.";
  if (!isSubscriptionCycle(input.cycle)) return "Billing cycle is invalid.";
  if (
    input.cycle === "custom" &&
    (!Number.isInteger(Number(input.customIntervalDays)) ||
      Number(input.customIntervalDays) <= 0)
  ) {
    return "Custom interval must be a positive whole number of days.";
  }
  if (!dateInputToIso(input.nextDueDate)) return "Next due date is required.";
  if (!Number.isInteger(Number(input.notifyLeadDays))) {
    return "Reminder lead must be a whole number of days.";
  }
  if (Number(input.notifyLeadDays) < 0) {
    return "Reminder lead cannot be negative.";
  }
  return null;
}

export function advanceNextDueDate(
  nextDueDate: string,
  cycle: SubscriptionCycle,
  customIntervalDays: number | null,
): string | null {
  const due = new Date(nextDueDate);
  if (Number.isNaN(due.getTime())) return null;

  if (cycle === "weekly") {
    return new Date(due.getTime() + 7 * DAY_MS).toISOString();
  }
  if (cycle === "monthly") return addUtcMonthsClamped(due, 1).toISOString();
  if (cycle === "yearly") return addUtcMonthsClamped(due, 12).toISOString();
  if (cycle === "custom" && customIntervalDays && customIntervalDays > 0) {
    return new Date(due.getTime() + customIntervalDays * DAY_MS).toISOString();
  }
  return null;
}

export function annualizedAmount(item: SubscriptionEntry): number {
  if (item.cycle === "weekly") return item.amount * 52;
  if (item.cycle === "monthly") return item.amount * 12;
  if (item.cycle === "yearly") return item.amount;
  const interval =
    item.customIntervalDays && item.customIntervalDays > 0
      ? item.customIntervalDays
      : 365;
  return (item.amount * 365) / interval;
}

export function summarizeSubscriptions(
  items: SubscriptionEntry[],
  settings: VaultSettings,
): SubscriptionSummary {
  const byCurrency = new Map<string, { monthly: number; annual: number }>();
  let convertedAnnual = 0;
  const missing = new Set<string>();
  const fx = readFinanceSettings(settings);

  for (const item of items) {
    const currency = normalizeCurrency(item.currency);
    const annual = annualizedAmount(item);
    const current = byCurrency.get(currency) ?? { monthly: 0, annual: 0 };
    current.annual += annual;
    current.monthly += annual / 12;
    byCurrency.set(currency, current);

    if (fx) {
      const rate = currency === fx.baseCurrency ? 1 : fx.rates[currency];
      if (typeof rate === "number" && Number.isFinite(rate) && rate >= 0) {
        convertedAnnual += annual * rate;
      } else {
        missing.add(currency);
      }
    }
  }

  const rawTotals = Array.from(byCurrency.entries())
    .map(([currency, total]) => ({
      currency,
      monthly: roundMoney(total.monthly),
      annual: roundMoney(total.annual),
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  return {
    rawTotals,
    converted: fx
      ? {
          currency: fx.baseCurrency,
          monthly: roundMoney(convertedAnnual / 12),
          annual: roundMoney(convertedAnnual),
          missingCurrencies: Array.from(missing).sort(),
        }
      : null,
  };
}

export function collectSubscriptionReminders(
  items: unknown[],
  now: Date,
  settings: VaultSettings,
): ReminderEvent[] {
  return subscriptionEntries(items).flatMap((item) => {
    const dueTime = Date.parse(item.nextDueDate);
    if (Number.isNaN(dueTime)) return [];
    const lead = effectiveLeadDays(item, settings);
    if (now.getTime() < dueTime - lead * DAY_MS) return [];
    return [
      {
        id: `${item.id}:due`,
        title: `Subscription due: ${item.service}`,
        body: formatReminderBody(item),
      },
    ];
  });
}

export function sortSubscriptions(
  items: SubscriptionEntry[],
): SubscriptionEntry[] {
  return [...items].sort((a, b) => {
    const leftDue = Date.parse(a.nextDueDate);
    const rightDue = Date.parse(b.nextDueDate);
    if (leftDue !== rightDue) return leftDue - rightDue;
    return a.service.localeCompare(b.service);
  });
}

export function isoToDateInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function dateInputToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatCurrencyAmount(amount: number, currency: string): string {
  return `${normalizeCurrency(currency)} ${roundMoney(amount).toFixed(2)}`;
}

export function cycleLabel(cycle: SubscriptionCycle): string {
  if (cycle === "weekly") return "/wk";
  if (cycle === "monthly") return "/mo";
  if (cycle === "yearly") return "/yr";
  return "/custom";
}

function normalizeSubscriptionEntry(
  item: SubscriptionEntry,
  fallbackUpdatedAt: string,
): SubscriptionEntry {
  return {
    id: item.id,
    service: item.service.trim(),
    url: item.url.trim(),
    amount: roundMoney(Math.max(0, item.amount)),
    currency: normalizeCurrency(item.currency),
    cycle: item.cycle,
    customIntervalDays:
      item.cycle === "custom" && item.customIntervalDays
        ? item.customIntervalDays
        : null,
    nextDueDate: item.nextDueDate,
    autoRenew: item.autoRenew,
    notifyLeadDays: item.notifyLeadDays,
    notes: item.notes.trim(),
    category: item.category.trim(),
    tags: normalizeTags(item.tags),
    updatedAt: item.updatedAt || fallbackUpdatedAt,
  };
}

function parseAmount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseLeadDays(value: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_SUBSCRIPTION_LEAD_DAYS;
}

function parseCustomIntervalDays(
  value: string,
  cycle: SubscriptionCycle,
): number | null {
  if (cycle !== "custom") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase() || "CNY";
}

function effectiveLeadDays(
  item: SubscriptionEntry,
  settings: VaultSettings,
): number {
  if (Number.isFinite(item.notifyLeadDays) && item.notifyLeadDays >= 0) {
    return item.notifyLeadDays;
  }
  const setting = settings.modules[SUBSCRIPTIONS_MODULE_ID]?.defaultLeadDays;
  return typeof setting === "number" && Number.isFinite(setting) && setting >= 0
    ? setting
    : DEFAULT_SUBSCRIPTION_LEAD_DAYS;
}

function readFinanceSettings(
  settings: VaultSettings,
): { baseCurrency: string; rates: Record<string, number> } | null {
  const finance = settings.modules.finance;
  if (!finance?.enabled || typeof finance.baseCurrency !== "string") {
    return null;
  }
  const baseCurrency = normalizeCurrency(finance.baseCurrency);
  const rates = finance.fxRates;
  if (!rates || typeof rates !== "object" || Array.isArray(rates)) {
    return { baseCurrency, rates: {} };
  }
  return { baseCurrency, rates: rates as Record<string, number> };
}

function addUtcMonthsClamped(date: Date, months: number): Date {
  const originalDay = date.getUTCDate();
  const target = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + months,
      1,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(originalDay, lastDay));
  return target;
}

function formatReminderBody(item: SubscriptionEntry): string {
  const parts = [
    `Due ${formatDate(item.nextDueDate)}`,
    formatCurrencyAmount(item.amount, item.currency),
    item.autoRenew ? "auto-renew" : "manual renewal",
  ];
  return parts.join(" - ");
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
