import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useVaultStore } from "@/stores/vault-store";
import { createDefaultModel } from "@/vault/model";
import {
  SubscriptionDetailView,
  SubscriptionsListView,
} from "./SubscriptionsModule";
import type { SubscriptionEntry } from "./types";

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
  nextDueDate: "2026-07-10T00:00:00.000Z",
  autoRenew: true,
  notifyLeadDays: 3,
  notes: "VPS",
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
    expect(screen.getByText("USD 32.00")).toBeVisible();
    expect(screen.getByText("USD 384.00")).toBeVisible();

    await user.type(screen.getByLabelText("Filter subscriptions"), "design");
    expect(screen.getAllByText("Figma")[0]).toBeVisible();
    expect(screen.queryByText("Linode")).not.toBeInTheDocument();
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

  it("shows converted summary totals when finance FX settings are enabled", () => {
    const base = createDefaultModel("2026-07-08T12:00:00.000Z");
    useVaultStore.setState({
      model: {
        ...base,
        settings: {
          ...base.settings,
          modules: {
            finance: {
              enabled: true,
              baseCurrency: "USD",
              fxRates: { SGD: 0.75 },
            },
          },
        },
      },
    });

    render(
      <SubscriptionsListView
        items={[item, { ...item, id: "sub-2", currency: "SGD", amount: 30 }]}
      />,
    );

    expect(
      screen.getByText("USD 42.50 monthly / USD 510.00 annual"),
    ).toBeVisible();
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
    await user.clear(screen.getByLabelText("Subscription currency"));
    await user.type(screen.getByLabelText("Subscription currency"), "sgd");
    await user.selectOptions(
      screen.getByLabelText("Subscription cycle"),
      "custom",
    );
    await user.type(
      screen.getByLabelText("Subscription custom interval days"),
      "45",
    );
    await user.type(
      screen.getByLabelText("Subscription next due date"),
      "2026-07-15",
    );
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
        currency: "SGD",
        cycle: "custom",
        customIntervalDays: 45,
        nextDueDate: "2026-07-15T00:00:00.000Z",
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

  it("edits, advances due date, and deletes through the store", async () => {
    const user = userEvent.setup();
    render(<SubscriptionsListView items={[item]} />);

    await user.click(screen.getByRole("button", { name: /edit linode/i }));
    await user.clear(screen.getByLabelText("Subscription service"));
    await user.type(
      screen.getByLabelText("Subscription service"),
      "Linode Pro",
    );
    await user.selectOptions(
      screen.getByLabelText("Subscription cycle"),
      "yearly",
    );
    await user.clear(screen.getByLabelText("Subscription next due date"));
    await user.type(
      screen.getByLabelText("Subscription next due date"),
      "2026-08-01",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(saveSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sub-1",
        service: "Linode Pro",
        cycle: "yearly",
        nextDueDate: "2026-08-01T00:00:00.000Z",
      }),
    );

    await user.click(screen.getByRole("button", { name: /advance linode/i }));
    expect(saveSubscription).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "sub-1",
        nextDueDate: "2026-08-10T00:00:00.000Z",
      }),
    );

    await user.click(screen.getByRole("button", { name: /delete linode/i }));
    expect(deleteSubscription).toHaveBeenCalledWith("sub-1");
  });

  it("renders detail actions", async () => {
    const user = userEvent.setup();
    const onAdvance = vi.fn();
    const onEdit = vi.fn();
    render(
      <SubscriptionDetailView
        item={{
          ...item,
          autoRenew: false,
          cycle: "custom",
          customIntervalDays: 45,
        }}
        onAdvance={onAdvance}
        onEdit={onEdit}
      />,
    );

    expect(screen.getByRole("heading", { name: "Linode" })).toBeVisible();
    expect(screen.getByText("Manual")).toBeVisible();
    expect(screen.getByText("Every 45 days")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /advance due/i }));
    await user.click(screen.getByRole("button", { name: /edit/i }));

    expect(onAdvance).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
