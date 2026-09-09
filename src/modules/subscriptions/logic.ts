import dayjs from "dayjs";

import { dateInputToIso, formatDate, isoToDateInput } from "@/lib/date";
import { calendarDueStatus } from "@/lib/due-status";
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

export { dateInputToIso, formatDate, isoToDateInput };

const DAY_MS = 86_400_000;

/** Manual renewals are due dates; auto-renew is the next invoice date. */
export function subscriptionNextDateLabel(autoRenew: boolean): string {
  return autoRenew ? "Next invoice date" : "Due date";
}

/**
 * Auto subscriptions are never overdue: once the invoice day is reached (today
 * or past), walk the billing cycle forward until the next invoice is after today.
 * Manual dues are left unchanged.
 */
export function nextAutoInvoiceDate(
  item: Pick<
    SubscriptionEntry,
    "autoRenew" | "cycle" | "customIntervalDays" | "nextDueDate"
  >,
  now: Date = new Date(),
): string {
  if (!item.autoRenew) return item.nextDueDate;
  const kind = calendarDueStatus(item.nextDueDate, now, "invoice")?.kind;
  // Roll on due day and past so Auto never stays on "Invoice today" / Overdue.
  if (kind !== "overdue" && kind !== "today") {
    return item.nextDueDate;
  }

  const startInput = isoToDateInput(item.nextDueDate);
  if (!startInput) return item.nextDueDate;

  const start = dayjs(startInput);
  const today = dayjs(now).startOf("day");
  for (let periods = 1; periods <= 1_200; periods += 1) {
    const advanced = addBillingCycles(start, item, periods);
    if (!advanced || !advanced.isValid() || !advanced.isAfter(start, "day")) {
      return item.nextDueDate;
    }
    // Strictly after today: renewing on the invoice day advances to the next cycle.
    if (advanced.startOf("day").isAfter(today)) {
      return dateInputToIso(advanced.format("YYYY-MM-DD")) ?? item.nextDueDate;
    }
  }
  return item.nextDueDate;
}

/** Apply {@link nextAutoInvoiceDate} without touching other fields. */
export function resolveSubscription(
  item: SubscriptionEntry,
  now: Date = new Date(),
): SubscriptionEntry {
  const nextDueDate = nextAutoInvoiceDate(item, now);
  return nextDueDate === item.nextDueDate ? item : { ...item, nextDueDate };
}

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
  now: Date = new Date(),
): IndexEntry[] {
  return items.map((raw) => {
    const item = resolveSubscription(raw, now);
    return {
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
      )} ${cycleLabel(item.cycle)} - ${
        item.autoRenew ? "invoice" : "due"
      } ${formatDate(item.nextDueDate)}`,
    };
  });
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
  if (!dateInputToIso(input.nextDueDate)) {
    return `${subscriptionNextDateLabel(input.autoRenew)} is required.`;
  }
  if (!Number.isInteger(Number(input.notifyLeadDays))) {
    return "Reminder lead must be a whole number of days.";
  }
  if (Number(input.notifyLeadDays) < 0) {
    return "Reminder lead cannot be negative.";
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

    if (item.autoRenew) {
      // Notify once when the invoice day is reached, then the date rolls forward.
      const kind = calendarDueStatus(item.nextDueDate, now, "invoice")?.kind;
      if (kind !== "overdue" && kind !== "today") return [];
      return [
        {
          id: `${item.id}:due:${item.nextDueDate}`,
          title: `Your subscription on ${item.service} has been automatically renewed. Expect invoice to come`,
          body: formatReminderBody(item),
        },
      ];
    }

    const lead = effectiveLeadDays(item, settings);
    if (now.getTime() < dueTime - lead * DAY_MS) return [];
    return [
      {
        // Include nextDueDate so reschedule / next cycle can notify again once.
        id: `${item.id}:due:${item.nextDueDate}`,
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
    nextDueDate: nextAutoInvoiceDate(item, new Date(fallbackUpdatedAt)),
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

function addBillingCycles(
  start: dayjs.Dayjs,
  item: Pick<SubscriptionEntry, "cycle" | "customIntervalDays">,
  periods: number,
): dayjs.Dayjs | null {
  if (item.cycle === "weekly") return start.add(periods, "week");
  if (item.cycle === "monthly") return start.add(periods, "month");
  if (item.cycle === "yearly") return start.add(periods, "year");
  if (!item.customIntervalDays || item.customIntervalDays <= 0) return null;
  return start.add(periods * item.customIntervalDays, "day");
}

function formatReminderBody(item: SubscriptionEntry): string {
  const parts = [
    item.autoRenew
      ? `Invoice ${formatDate(item.nextDueDate)}`
      : `Due ${formatDate(item.nextDueDate)}`,
    formatCurrencyAmount(item.amount, item.currency),
    item.autoRenew ? "auto-renew" : "manual renewal",
  ];
  return parts.join(" - ");
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
