import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { subscriptionsModule } from "./module";
import type { SubscriptionEntry } from "./types";

const DetailView = subscriptionsModule.DetailView!;
const EditView = subscriptionsModule.EditView!;

const subscription: SubscriptionEntry = {
  id: "sub-1",
  service: "Linode",
  url: "https://cloud.linode.com/account/billing",
  amount: 20,
  currency: "USD",
  cycle: "monthly",
  customIntervalDays: null,
    nextDueDate: "2099-07-10T00:00:00.000Z",
  autoRenew: true,
  notifyLeadDays: 3,
  notes: "",
  category: "Personal",
  tags: [],
  updatedAt: "2026-07-08T12:00:00.000Z",
};

describe("subscriptionsModule surface", () => {
  it("returns null for non-subscription items in the DetailView", () => {
    const { container } = render(
      <DetailView item={{ not: "a subscription" }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("treats non-subscription edit items as create mode", () => {
    render(
      <EditView item={{ nope: true }} onCancel={() => {}} onSave={() => {}} />,
    );
    expect(
      screen.getByRole("heading", { name: /new subscription/i }),
    ).toBeVisible();
  });

  it("builds index entries and renders its views", () => {
    expect(subscriptionsModule.buildIndex([subscription])[0]).toEqual(
      expect.objectContaining({
        id: "sub-1",
        moduleId: "subscriptions",
        type: "subscription",
      }),
    );

    const list = render(
      <subscriptionsModule.ListView items={[subscription]} />,
    );
    expect(
      screen.getByRole("heading", { name: "Subscriptions" }),
    ).toBeVisible();
    list.unmount();

    const detail = render(<DetailView item={subscription} />);
    expect(screen.getByRole("heading", { name: "Linode" })).toBeVisible();
    detail.unmount();

    render(
      <EditView item={subscription} onCancel={() => {}} onSave={() => {}} />,
    );
    expect(
      screen.getByRole("heading", { name: /edit subscription/i }),
    ).toBeVisible();
  });
});
