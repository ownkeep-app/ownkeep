import { describe, expect, it, vi } from "vitest";

import { runSchedulerTick } from "@/lib/scheduler";
import { createDefaultModel } from "@/vault/model";
import {
  annualizedAmount,
  buildSubscriptionIndex,
  collectSubscriptionReminders,
  createSubscriptionEntry,
  cycleLabel,
  dateInputToIso,
  emptySubscriptionForm,
  formatCurrencyAmount,
  formatDate,
  formFromSubscription,
  isoToDateInput,
  nextAutoInvoiceDate,
  resolveSubscription,
  sortSubscriptions,
  subscriptionEntries,
  subscriptionNextDateLabel,
  summarizeSubscriptions,
  updateSubscriptionEntry,
  validateSubscriptionInput,
} from "./logic";
import { subscriptionsModule } from "./module";
import type { SubscriptionEntry } from "./types";

const NOW = "2026-07-08T12:00:00.000Z";

function subscription(
  overrides: Partial<SubscriptionEntry> = {},
): SubscriptionEntry {
  return {
    id: "sub-1",
    service: "Linode",
    url: "https://cloud.linode.com/account/billing",
    amount: 20,
    currency: "USD",
    cycle: "monthly",
    customIntervalDays: null,
    nextDueDate: "2026-07-10T00:00:00.000Z",
    autoRenew: true,
    notifyLeadDays: 3,
    notes: "VPS",
    category: "Personal",
    tags: [],
    updatedAt: NOW,
    ...overrides,
  };
}

describe("subscription module logic", () => {
  it("builds searchable subscription index entries", () => {
    const index = buildSubscriptionIndex([subscription()]);

    expect(index[0]).toEqual(
      expect.objectContaining({
        id: "sub-1",
        moduleId: "subscriptions",
        type: "subscription",
      }),
    );
    expect(index[0].displayLine).toContain("Linode - USD 20.00 /mo");
    expect(index[0].displayLine).toContain("invoice");
    expect(
      buildSubscriptionIndex([subscription({ autoRenew: false })])[0]
        .displayLine,
    ).toContain("due");
    expect(index[0].searchString).toContain("VPS");
  });

  it("labels the next date field by renewal mode", () => {
    expect(subscriptionNextDateLabel(true)).toBe("Next invoice date");
    expect(subscriptionNextDateLabel(false)).toBe("Due date");
  });

  it("normalizes new and edited entries", () => {
    const input = {
      ...emptySubscriptionForm(),
      service: "  Tailscale  ",
      url: " https://login.tailscale.com/admin/billing ",
      amount: "5.50",
      currency: " sgd ",
      cycle: "custom" as const,
      customIntervalDays: "45",
      nextDueDate: "2026-07-15",
      autoRenew: false,
      notifyLeadDays: "7",
      notes: " team ",
    };

    expect(validateSubscriptionInput(input)).toBeNull();
    const created = createSubscriptionEntry(input, NOW, "sub-new");

    expect(created).toEqual(
      expect.objectContaining({
        id: "sub-new",
        service: "Tailscale",
        url: "https://login.tailscale.com/admin/billing",
        amount: 5.5,
        currency: "SGD",
        cycle: "custom",
        customIntervalDays: 45,
        nextDueDate: new Date(2026, 6, 15, 23, 59, 59, 0).toISOString(),
        autoRenew: false,
        notifyLeadDays: 7,
        notes: "team",
      }),
    );

    const edited = updateSubscriptionEntry(
      created,
      { ...formFromSubscription(created), cycle: "monthly" },
      NOW,
    );
    expect(edited.customIntervalDays).toBeNull();
  });

  it("falls back for direct creation and update edge cases", () => {
    const created = createSubscriptionEntry(
      {
        ...emptySubscriptionForm(),
        service: "Fallback",
        amount: "bad",
        cycle: "custom",
        customIntervalDays: "bad",
        nextDueDate: "",
        notifyLeadDays: "bad",
      },
      NOW,
      "fallback",
    );

    expect(created).toEqual(
      expect.objectContaining({
        amount: 0,
        customIntervalDays: null,
        nextDueDate: NOW,
        notifyLeadDays: 3,
      }),
    );

    expect(
      updateSubscriptionEntry(
        subscription({ nextDueDate: "2026-07-10T00:00:00.000Z" }),
        { ...formFromSubscription(subscription()), nextDueDate: "bad" },
        NOW,
      ).nextDueDate,
    ).toBe("2026-07-10T00:00:00.000Z");
  });

  it("validates required fields and numeric limits", () => {
    expect(validateSubscriptionInput(emptySubscriptionForm())).toMatch(
      /service/i,
    );
    expect(
      validateSubscriptionInput({
        ...emptySubscriptionForm(),
        service: "Linode",
        amount: "-1",
      }),
    ).toMatch(/amount/i);
    expect(
      validateSubscriptionInput({
        ...emptySubscriptionForm(),
        service: "Linode",
        currency: "",
        amount: "1",
      }),
    ).toMatch(/currency/i);
    expect(
      validateSubscriptionInput({
        ...emptySubscriptionForm(),
        service: "Linode",
        amount: "1",
        nextDueDate: "2026-07-10",
        notifyLeadDays: "1.5",
      }),
    ).toMatch(/whole number/i);
    expect(
      validateSubscriptionInput({
        ...emptySubscriptionForm(),
        service: "Linode",
        amount: "1",
        cycle: "custom",
        customIntervalDays: "0",
        nextDueDate: "2026-07-10",
      }),
    ).toMatch(/custom interval/i);
    expect(
      validateSubscriptionInput({
        ...emptySubscriptionForm(),
        service: "Linode",
        amount: "1",
        cycle: "bad" as never,
        nextDueDate: "2026-07-10",
      }),
    ).toMatch(/billing cycle/i);
    expect(
      validateSubscriptionInput({
        ...emptySubscriptionForm(),
        service: "Linode",
        amount: "1",
        nextDueDate: "2026-07-10",
        notifyLeadDays: "-1",
      }),
    ).toMatch(/negative/i);
    expect(
      validateSubscriptionInput({
        ...emptySubscriptionForm(),
        service: "Linode",
        amount: "1",
      }),
    ).toMatch(/invoice date/i);
    expect(
      validateSubscriptionInput({
        ...emptySubscriptionForm(),
        service: "Linode",
        amount: "1",
        autoRenew: false,
      }),
    ).toMatch(/due date/i);
  });

  it("calculates annualized and FX-converted summaries", () => {
    const items = [
      subscription({ id: "weekly", amount: 10, cycle: "weekly" }),
      subscription({ id: "monthly", amount: 20, cycle: "monthly" }),
      subscription({ id: "yearly", amount: 120, cycle: "yearly" }),
      subscription({
        id: "custom",
        amount: 30,
        currency: "SGD",
        cycle: "custom",
        customIntervalDays: 30,
      }),
    ];
    const settings = {
      ...createDefaultModel(NOW).settings,
      modules: {
        finance: {
          enabled: true,
          baseCurrency: "USD",
          fxRates: { SGD: 0.75 },
        },
      },
    };

    expect(annualizedAmount(items[0])).toBe(520);
    expect(
      annualizedAmount(
        subscription({ cycle: "custom", customIntervalDays: null }),
      ),
    ).toBe(20);
    const summary = summarizeSubscriptions(items, settings);

    expect(summary.rawTotals).toEqual([
      { currency: "SGD", monthly: 30.42, annual: 365 },
      { currency: "USD", monthly: 73.33, annual: 880 },
    ]);
    expect(summary.converted).toEqual({
      currency: "USD",
      monthly: 96.15,
      annual: 1153.75,
      missingCurrencies: [],
    });
  });

  it("handles raw summaries and disabled or incomplete finance settings", () => {
    expect(
      summarizeSubscriptions(
        [subscription()],
        createDefaultModel(NOW).settings,
      ),
    ).toEqual({
      rawTotals: [{ currency: "USD", monthly: 20, annual: 240 }],
      converted: null,
    });
    expect(
      summarizeSubscriptions([subscription()], {
        ...createDefaultModel(NOW).settings,
        modules: { finance: { enabled: false, baseCurrency: "USD" } },
      }).converted,
    ).toBeNull();
    expect(
      summarizeSubscriptions([subscription()], {
        ...createDefaultModel(NOW).settings,
        modules: { finance: { enabled: true } },
      }).converted,
    ).toBeNull();
    expect(
      summarizeSubscriptions([subscription({ currency: "SGD" })], {
        ...createDefaultModel(NOW).settings,
        modules: {
          finance: { enabled: true, baseCurrency: "USD", fxRates: [] },
        },
      }).converted?.missingCurrencies,
    ).toEqual(["SGD"]);
  });

  it("reports missing currencies when finance FX lacks a rate", () => {
    const settings = {
      ...createDefaultModel(NOW).settings,
      modules: {
        finance: {
          enabled: true,
          baseCurrency: "USD",
          fxRates: {},
        },
      },
    };

    expect(
      summarizeSubscriptions([subscription({ currency: "SGD" })], settings)
        .converted,
    ).toEqual({
      currency: "USD",
      monthly: 0,
      annual: 0,
      missingCurrencies: ["SGD"],
    });
  });

  it("collects lead-window reminders and falls back to module defaults", () => {
    const settings = {
      ...createDefaultModel(NOW).settings,
      modules: {
        subscriptions: { enabled: true, defaultLeadDays: 1 },
      },
    };

    expect(
      collectSubscriptionReminders(
        [subscription({ nextDueDate: "2026-07-12T00:00:00.000Z" })],
        new Date(NOW),
        settings,
      ),
    ).toEqual([]);

    expect(
      collectSubscriptionReminders([subscription()], new Date(NOW), settings),
    ).toEqual([
      expect.objectContaining({
        id: "sub-1:due",
        title: "Subscription invoice: Linode",
        body: expect.stringContaining("Invoice"),
      }),
    ]);

    expect(
      collectSubscriptionReminders(
        [subscription({ autoRenew: false })],
        new Date(NOW),
        settings,
      ),
    ).toEqual([
      expect.objectContaining({
        title: "Subscription due: Linode",
        body: expect.stringContaining("Due"),
      }),
    ]);

    expect(
      collectSubscriptionReminders(
        [
          subscription({
            nextDueDate: "2026-07-09T00:00:00.000Z",
            notifyLeadDays: -1,
          }),
          subscription({ nextDueDate: "bad" }),
          { id: "bad" },
        ],
        new Date(NOW),
        settings,
      ),
    ).toHaveLength(1);

    expect(
      collectSubscriptionReminders(
        [
          subscription({
            nextDueDate: dateInputToIso("2026-05-01") ?? "",
            cycle: "monthly",
          }),
        ],
        new Date(NOW),
        settings,
      ),
    ).toEqual([]);
  });

  it("advances overdue auto invoice dates by billing cycle", () => {
    const now = new Date("2026-08-11T12:00:00");

    expect(
      nextAutoInvoiceDate(
        subscription({
          cycle: "monthly",
          nextDueDate: dateInputToIso("2026-06-15") ?? "",
        }),
        now,
      ),
    ).toBe(dateInputToIso("2026-08-15"));
    expect(
      nextAutoInvoiceDate(
        subscription({
          cycle: "yearly",
          nextDueDate: dateInputToIso("2025-03-01") ?? "",
        }),
        now,
      ),
    ).toBe(dateInputToIso("2027-03-01"));
    expect(
      nextAutoInvoiceDate(
        subscription({
          cycle: "weekly",
          nextDueDate: dateInputToIso("2026-08-01") ?? "",
        }),
        now,
      ),
    ).toBe(dateInputToIso("2026-08-15"));
    expect(
      nextAutoInvoiceDate(
        subscription({
          cycle: "custom",
          customIntervalDays: 30,
          nextDueDate: dateInputToIso("2026-07-01") ?? "",
        }),
        now,
      ),
    ).toBe(dateInputToIso("2026-08-30"));
    expect(
      nextAutoInvoiceDate(
        subscription({
          cycle: "monthly",
          nextDueDate: dateInputToIso("2026-01-31") ?? "",
        }),
        new Date("2026-03-15T12:00:00"),
      ),
    ).toBe(dateInputToIso("2026-03-31"));
    expect(
      nextAutoInvoiceDate(
        subscription({
          autoRenew: false,
          nextDueDate: dateInputToIso("2026-06-15") ?? "",
        }),
        now,
      ),
    ).toBe(dateInputToIso("2026-06-15"));
    expect(
      nextAutoInvoiceDate(
        subscription({
          cycle: "monthly",
          nextDueDate: dateInputToIso("2026-08-11") ?? "",
        }),
        now,
      ),
    ).toBe(dateInputToIso("2026-08-11"));
    expect(
      nextAutoInvoiceDate(
        subscription({
          cycle: "custom",
          customIntervalDays: null,
          nextDueDate: dateInputToIso("2026-06-15") ?? "",
        }),
        now,
      ),
    ).toBe(dateInputToIso("2026-06-15"));
    expect(nextAutoInvoiceDate(subscription({ nextDueDate: "bad" }), now)).toBe(
      "bad",
    );

    const created = createSubscriptionEntry(
      {
        ...emptySubscriptionForm(),
        service: "Old invoice",
        amount: "1",
        cycle: "monthly",
        nextDueDate: "2026-06-15",
      },
      now.toISOString(),
      "rolled",
    );
    expect(created.nextDueDate).toBe(dateInputToIso("2026-08-15"));
    expect(
      resolveSubscription(
        subscription({
          cycle: "monthly",
          nextDueDate: dateInputToIso("2026-06-15") ?? "",
        }),
        now,
      ).nextDueDate,
    ).toBe(dateInputToIso("2026-08-15"));
  });

  it("filters invalid records, sorts by due date, and formats dates", () => {
    expect(subscriptionEntries([subscription(), null, { id: "bad" }])).toEqual([
      subscription(),
    ]);
    expect(
      sortSubscriptions([
        subscription({
          id: "later",
          service: "Zoom",
          nextDueDate: "2026-08-01T00:00:00.000Z",
        }),
        subscription({
          id: "soon",
          service: "Apple",
          nextDueDate: "2026-07-09T00:00:00.000Z",
        }),
      ]).map((item) => item.id),
    ).toEqual(["soon", "later"]);
    expect(
      sortSubscriptions([
        subscription({ id: "zoom", service: "Zoom" }),
        subscription({ id: "apple", service: "Apple" }),
      ]).map((item) => item.id),
    ).toEqual(["apple", "zoom"]);
    expect(dateInputToIso("2026-07-09")).toBe(
      new Date(2026, 6, 9, 23, 59, 59, 0).toISOString(),
    );
    expect(dateInputToIso("")).toBeNull();
    expect(isoToDateInput("bad")).toBe("");
    expect(formatDate("bad")).toBe("Invalid date");
    expect(formatCurrencyAmount(3, "")).toBe("CNY 3.00");
    expect(["/wk", "/mo", "/yr", "/custom"]).toEqual([
      cycleLabel("weekly"),
      cycleLabel("monthly"),
      cycleLabel("yearly"),
      cycleLabel("custom"),
    ]);
  });

  it("uses scheduler de-dupe for due subscription reminders", async () => {
    const model = {
      ...createDefaultModel(NOW),
      settings: {
        ...createDefaultModel(NOW).settings,
        modules: { subscriptions: { enabled: true } },
      },
      modules: { subscriptions: [subscription()] },
    };
    const notify = vi.fn(async () => {});

    const first = await runSchedulerTick({
      model,
      modules: [subscriptionsModule],
      lastNotified: {},
      now: new Date(NOW),
      notify,
    });
    const second = await runSchedulerTick({
      model,
      modules: [subscriptionsModule],
      lastNotified: first.lastNotified,
      now: new Date("2026-07-08T12:01:00.000Z"),
      notify,
    });

    expect(first.sent.map((reminder) => reminder.key)).toEqual([
      "subscriptions:sub-1:due",
    ]);
    expect(second.sent).toEqual([]);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
