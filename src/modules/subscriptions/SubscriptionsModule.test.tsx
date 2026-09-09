import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chooseRowAction, confirmDelete } from "@/test/row-actions";
import { pickDate } from "@/test/date-picker";
import { useVaultStore } from "@/stores/vault-store";
import { createDefaultModel } from "@/vault/model";
import { dateInputToIso } from "@/lib/date";
import {
  SubscriptionDetailView,
  SubscriptionsListView,
} from "./SubscriptionsModule";
import { nextAutoInvoiceDate } from "./logic";
import type { SubscriptionEntry } from "./types";

const openUrl = vi.fn(async (_url: string) => {});
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: (url: string) => openUrl(url),
}));

const actions = {
  saveSubscription: useVaultStore.getState().saveSubscription,
  deleteSubscription: useVaultStore.getState().deleteSubscription,
};

const item: SubscriptionEntry = {
  id: "sub-1",
  service: "Linode",
  url: "https://cloud.linode.com/account/billing",
  amount: 20,
  currency: "USD",
  cycle: "monthly",
  customIntervalDays: null,
  nextDueDate: dayjs().add(14, "day").toISOString(),
  autoRenew: true,
  notifyLeadDays: 3,
  notes: "VPS",
  category: "Personal",
  tags: [],
  updatedAt: "2026-07-08T12:00:00.000Z",
};

describe("SubscriptionsListView", () => {
  const saveSubscription = vi.fn(async () => {});
  const deleteSubscription = vi.fn(async () => {});

  beforeEach(() => {
    vi.clearAllMocks();
    useVaultStore.setState({
      model: createDefaultModel("2026-07-08T12:00:00.000Z"),
      saveSubscription,
      deleteSubscription,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useVaultStore.setState({ ...actions, model: null });
  });

  it("opens the shared FX rates view from the header", async () => {
    const user = userEvent.setup();
    render(<SubscriptionsListView items={[item]} />);

    await user.click(screen.getByRole("button", { name: "FX rates" }));
    expect(screen.getByRole("heading", { name: "FX rates" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close FX rates" }));
    expect(
      screen.getByRole("heading", { name: "Subscriptions" }),
    ).toBeVisible();
  });

  it("renders rows, filters by metadata, and shows summary totals", async () => {
    const user = userEvent.setup();
    render(
      <SubscriptionsListView
        items={[
          item,
          {
            ...item,
            id: "sub-2",
            service: "Figma",
            amount: 12,
            notes: "design",
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Subscriptions" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "FX rates" })).toBeVisible();
    expect(screen.getByText("USD 32.00")).toBeVisible();
    expect(screen.getByText("USD 384.00")).toBeVisible();

    await user.type(screen.getByLabelText("Filter subscriptions"), "design");
    expect(screen.getAllByText("Figma")[0]).toBeVisible();
    expect(screen.queryByText("Linode")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear Filters" }));
    expect(screen.getByLabelText("Filter subscriptions")).toHaveValue("");
    expect(screen.getAllByText("Linode")[0]).toBeVisible();
  });

  it("edits cycle and renew inline from the list", async () => {
    const user = userEvent.setup();
    render(<SubscriptionsListView items={[item]} />);

    await user.click(screen.getByRole("button", { name: "Cycle for Linode" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Yearly" }));
    expect(saveSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sub-1",
        cycle: "yearly",
        customIntervalDays: null,
      }),
    );

    await user.click(
      screen.getByRole("button", { name: "Renewal for Linode" }),
    );
    await user.click(screen.getByRole("menuitemradio", { name: "Manual" }));
    expect(saveSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sub-1", autoRenew: false }),
    );
  });

  it("keeps the open detail card in sync when cycle changes from the list", async () => {
    const user = userEvent.setup();
    render(<SubscriptionsListView items={[item]} />);

    await chooseRowAction(user, "Linode", "View");
    expect(screen.getByRole("dialog", { name: "Linode" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cycle for Linode" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Custom" }));
    expect(saveSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sub-1",
        cycle: "custom",
        customIntervalDays: 30,
      }),
    );
  });

  it("opens billing URLs from the list link column for http(s) only", async () => {
    const user = userEvent.setup();
    render(
      <SubscriptionsListView
        items={[
          item,
          { ...item, id: "ftp", service: "FTP", url: "ftp://x" },
          { ...item, id: "none", service: "None", url: "" },
        ]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /open billing url for linode/i }),
    );
    expect(openUrl).toHaveBeenCalledWith(item.url);
    expect(
      screen.queryByRole("button", { name: /open billing url for ftp/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /open billing url for none/i }),
    ).not.toBeInTheDocument();
  });

  it("opens the requested subscription detail when focused by the shell", async () => {
    const handled = vi.fn();
    render(
      <SubscriptionsListView
        items={[item]}
        focusItemId="sub-1"
        onFocusItemHandled={handled}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "Linode" });
    expect(dialog).toBeVisible();
    expect(handled).toHaveBeenCalledTimes(1);
  });

  it("shows a no-matches state when the filter excludes everything", async () => {
    const user = userEvent.setup();
    render(<SubscriptionsListView items={[item]} />);

    await user.type(
      screen.getByLabelText("Filter subscriptions"),
      "zzz-nomatch",
    );

    expect(screen.getByText(/no matches/i)).toBeVisible();
  });

  it("sorts rows by clicked table headers", async () => {
    const user = userEvent.setup();
    render(
      <SubscriptionsListView
        items={[
          item,
          {
            ...item,
            id: "sub-2",
            service: "Figma",
            amount: 12,
            cycle: "weekly",
            nextDueDate: "2026-07-05T00:00:00.000Z",
            autoRenew: false,
            notes: "design",
          },
          {
            ...item,
            id: "sub-3",
            service: "Apple",
            amount: 30,
            cycle: "yearly",
            nextDueDate: "2026-08-01T00:00:00.000Z",
            notes: "music",
          },
        ]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /sort amount ascending/i }),
    );
    expect(subscriptionRowServices()).toEqual(["Figma", "Linode", "Apple"]);

    await user.click(
      screen.getByRole("button", { name: /sort amount descending/i }),
    );
    expect(subscriptionRowServices()).toEqual(["Apple", "Linode", "Figma"]);

    await user.click(
      screen.getByRole("button", { name: /sort cycle ascending/i }),
    );
    expect(subscriptionRowServices()).toEqual(["Figma", "Linode", "Apple"]);

    await user.click(
      screen.getByRole("button", { name: /sort next date ascending/i }),
    );
    expect(subscriptionRowServices()).toEqual(["Figma", "Linode", "Apple"]);

    await user.click(
      screen.getByRole("button", { name: /sort renew ascending/i }),
    );
    expect(subscriptionRowServices()).toEqual(["Linode", "Apple", "Figma"]);
  });

  it("groups native currency totals by billing period", () => {
    const base = createDefaultModel("2026-07-08T12:00:00.000Z");
    useVaultStore.setState({
      model: {
        ...base,
        settings: {
          ...base.settings,
          modules: {
            finance: {
              enabled: true,
              baseCurrency: "CNY",
              fxRates: { USD: 7 },
            },
          },
        },
      },
    });

    render(
      <SubscriptionsListView
        items={[item, { ...item, id: "sub-2", currency: "CNY", amount: 30 }]}
      />,
    );

    const monthlyTotals = screen.getByRole("region", {
      name: "Monthly subscription totals",
    });
    expect(within(monthlyTotals).getByText("CNY 30.00")).toBeVisible();
    expect(within(monthlyTotals).getByText("USD 20.00")).toBeVisible();
    expect(within(monthlyTotals).getByText("Base CNY 170.00")).toBeVisible();

    const yearlyTotals = screen.getByRole("region", {
      name: "Yearly subscription totals",
    });
    expect(within(yearlyTotals).getByText("CNY 360.00")).toBeVisible();
    expect(within(yearlyTotals).getByText("USD 240.00")).toBeVisible();
    expect(within(yearlyTotals).getByText("Base CNY 2040.00")).toBeVisible();
  });

  it("creates a subscription entry from the edit form", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "new-sub" });
    render(<SubscriptionsListView items={[]} />);

    await user.click(screen.getByRole("button", { name: "New" }));
    await user.type(screen.getByLabelText("Subscription service"), "Tailscale");
    await user.type(
      screen.getByLabelText("Subscription billing URL"),
      "https://login.tailscale.com/admin/billing",
    );
    await user.type(screen.getByLabelText("Subscription amount"), "5.50");
    await user.selectOptions(
      screen.getByLabelText("Subscription currency"),
      "USD",
    );
    await user.selectOptions(
      screen.getByLabelText("Subscription cycle"),
      "custom",
    );
    await user.type(
      screen.getByLabelText("Subscription custom interval days"),
      "45",
    );
    await pickDate(user, "Subscription next invoice date", "2026-07-15");
    await user.clear(screen.getByLabelText("Subscription reminder lead days"));
    await user.type(
      screen.getByLabelText("Subscription reminder lead days"),
      "7",
    );
    await user.click(screen.getByLabelText("Subscription auto renew"));
    await user.type(screen.getByLabelText("Subscription notes"), "team");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(saveSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "new-sub",
        service: "Tailscale",
        url: "https://login.tailscale.com/admin/billing",
        amount: 5.5,
        currency: "USD",
        cycle: "custom",
        customIntervalDays: 45,
        nextDueDate: new Date(2026, 6, 15, 23, 59, 59, 0).toISOString(),
        autoRenew: false,
        notifyLeadDays: 7,
        notes: "team",
      }),
    );
  });

  it("validates required fields before saving", async () => {
    const user = userEvent.setup();
    render(<SubscriptionsListView items={[]} />);

    await user.click(screen.getByRole("button", { name: "New" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(saveSubscription).not.toHaveBeenCalled();
    expect(screen.getByText(/service is required/i)).toBeVisible();
  });

  it("edits and deletes through the store", async () => {
    const user = userEvent.setup();
    render(<SubscriptionsListView items={[item]} />);

    await chooseRowAction(user, "Linode", "Edit");
    await user.clear(screen.getByLabelText("Subscription service"));
    await user.type(
      screen.getByLabelText("Subscription service"),
      "Linode Pro",
    );
    await user.selectOptions(
      screen.getByLabelText("Subscription cycle"),
      "yearly",
    );
    await pickDate(user, "Subscription next invoice date", "2027-03-01");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(saveSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sub-1",
        service: "Linode Pro",
        cycle: "yearly",
        nextDueDate: new Date(2027, 2, 1, 23, 59, 59, 0).toISOString(),
      }),
    );

    await chooseRowAction(user, "Linode", "Delete");
    await confirmDelete(user);
    expect(deleteSubscription).toHaveBeenCalledWith("sub-1");
  });

  it("runs detail edit, close, and delete actions", async () => {
    const user = userEvent.setup();
    render(<SubscriptionsListView items={[item]} />);

    await chooseRowAction(user, "Linode", "View");
    let dialog = screen.getByRole("dialog", { name: "Linode" });

    await user.click(within(dialog).getByRole("button", { name: "Edit" }));
    expect(
      screen.getByRole("heading", { name: /edit subscription/i }),
    ).toBeInTheDocument();
    const cancelButtons = screen.getAllByRole("button", { name: "Cancel" });
    await user.click(cancelButtons[cancelButtons.length - 1]);
    expect(
      screen.getByRole("heading", { name: "Subscriptions" }),
    ).toBeVisible();

    await chooseRowAction(user, "Linode", "View");
    dialog = screen.getByRole("dialog", { name: "Linode" });
    await user.click(
      within(dialog).getByRole("button", { name: /close details/i }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Linode" }),
      ).not.toBeInTheDocument(),
    );

    await chooseRowAction(user, "Linode", "View");
    dialog = screen.getByRole("dialog", { name: "Linode" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await confirmDelete(user);
    expect(deleteSubscription).toHaveBeenCalledWith("sub-1");
  });

  it("shows invoice-status badges for auto renew and due badges for manual", () => {
    const now = dayjs();
    render(
      <SubscriptionsListView
        items={[
          {
            ...item,
            id: "overdue-manual",
            service: "Overdue manual",
            autoRenew: false,
            nextDueDate: now.subtract(2, "day").toISOString(),
          },
          {
            ...item,
            id: "today",
            service: "Today sub",
            nextDueDate: now.toISOString(),
          },
          {
            ...item,
            id: "soon",
            service: "Soon sub",
            nextDueDate: now.add(2, "day").toISOString(),
          },
          {
            ...item,
            id: "manual-soon",
            service: "Manual soon",
            autoRenew: false,
            nextDueDate: now.add(3, "day").toISOString(),
          },
        ]}
      />,
    );

    expect(screen.getByText("Overdue")).toBeVisible();
    // Auto due today rolls forward immediately — never Overdue, never stuck on Invoice today.
    expect(screen.queryByText("Invoice today")).not.toBeInTheDocument();
    expect(screen.getByText("Invoice in 2 days")).toBeVisible();
    expect(screen.getAllByText(/^Invoice in \d+ days$/)).toHaveLength(2);
    expect(screen.getByText("Due in 3 days")).toBeVisible();
  });

  it("rolls overdue auto invoices forward and persists the next date", async () => {
    const overdue = {
      ...item,
      cycle: "monthly" as const,
      nextDueDate:
        dateInputToIso(dayjs().subtract(2, "month").format("YYYY-MM-DD")) ?? "",
    };

    render(<SubscriptionsListView items={[overdue]} />);

    await waitFor(() => {
      expect(saveSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "sub-1",
          nextDueDate: nextAutoInvoiceDate(overdue),
        }),
      );
    });
    expect(screen.queryByText("Overdue")).not.toBeInTheDocument();
  });

  it("renders detail fields", () => {
    render(
      <SubscriptionDetailView
        item={{
          ...item,
          autoRenew: false,
          cycle: "custom",
          customIntervalDays: 45,
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Linode" })).toBeVisible();
    expect(screen.getByText("Manual")).toBeVisible();
    expect(screen.getByText("Every 45 days")).toBeVisible();
    expect(screen.getByText(/Due in|Due today|Overdue/)).toBeVisible();
  });
});

function subscriptionRowServices(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[1].textContent ?? "");
}
