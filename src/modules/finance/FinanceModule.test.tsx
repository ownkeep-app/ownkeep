import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useVaultStore } from "@/stores/vault-store";
import { createDefaultModel } from "@/vault/model";
import { FinanceListView } from "./FinanceModule";
import type { Snapshot } from "./types";

vi.mock("uplot", () => ({
  default: vi.fn(() => ({ destroy: vi.fn() })),
}));

const snapshots: Snapshot[] = [
  {
    id: "s1",
    date: "2026-06-01T00:00:00.000Z",
    note: "june",
    entries: [{ place: "DBS", category: "bank", amount: 100, currency: "USD" }],
    updatedAt: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "s2",
    date: "2026-07-01T00:00:00.000Z",
    note: "july",
    entries: [
      { place: "Chase", category: "bank", amount: 200, currency: "USD" },
      { place: "DBS", category: "bank", amount: 100, currency: "SGD" },
    ],
    updatedAt: "2026-07-01T00:00:00.000Z",
  },
];

const saveSnapshot = vi.fn<(entry: Snapshot) => Promise<void>>(async () => {});
const deleteSnapshot = vi.fn<(id: string) => Promise<void>>(async () => {});
const updateFinanceSettings = vi.fn<
  (patch: {
    baseCurrency?: string;
    fxRates?: Record<string, number>;
  }) => Promise<void>
>(async () => {});

beforeEach(() => {
  vi.clearAllMocks();
  const model = createDefaultModel("2026-07-07T00:00:00.000Z");
  model.settings.modules.finance = {
    enabled: true,
    baseCurrency: "USD",
    fxRates: { SGD: 0.74 },
  };
  model.modules.finance = snapshots;
  useVaultStore.setState({
    model,
    saveSnapshot,
    deleteSnapshot,
    updateFinanceSettings,
  });
});

describe("FinanceListView", () => {
  it("shows base-currency net worth per snapshot", () => {
    render(<FinanceListView items={snapshots} />);
    // July: 200 USD + 100 SGD * 0.74 = 274
    expect(screen.getAllByText(/USD 274\.00/).length).toBeGreaterThan(0);
    // June: 100 USD
    expect(screen.getAllByText(/USD 100\.00/).length).toBeGreaterThan(0);
  });

  it("adds a snapshot through the form", async () => {
    const user = userEvent.setup();
    render(<FinanceListView items={snapshots} />);
    await user.click(screen.getByRole("button", { name: /new snapshot/i }));
    await user.type(screen.getByLabelText("Snapshot date"), "2026-08-01");
    await user.type(screen.getByLabelText("Entry 1 place"), "Cash");
    await user.type(screen.getByLabelText("Entry 1 amount"), "500");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(saveSnapshot).toHaveBeenCalledTimes(1);
    const saved = saveSnapshot.mock.calls[0][0];
    expect(saved.entries[0]).toMatchObject({ place: "Cash", amount: 500 });
  });

  it("re-totals when an FX rate is edited", async () => {
    const user = userEvent.setup();
    render(<FinanceListView items={snapshots} />);
    await user.click(screen.getByRole("button", { name: /fx rates/i }));
    const rate = screen.getByLabelText("Rate 1 value");
    await user.clear(rate);
    await user.type(rate, "0.8");
    await user.click(screen.getByRole("button", { name: /save rates/i }));

    expect(updateFinanceSettings).toHaveBeenCalledWith({
      baseCurrency: "USD",
      fxRates: { SGD: 0.8 },
    });
  });

  it("deletes a snapshot", async () => {
    const user = userEvent.setup();
    render(<FinanceListView items={snapshots} />);
    await user.click(
      screen.getByRole("button", { name: /delete snapshot jul/i }),
    );
    expect(deleteSnapshot).toHaveBeenCalledWith("s2");
  });

  it("shows the detail pane with a missing-rate warning, note, and edit", async () => {
    const user = userEvent.setup();
    const withEur: Snapshot[] = [
      {
        id: "s3",
        date: "2026-08-01T00:00:00.000Z",
        note: "aug note",
        entries: [
          { place: "N26", category: "bank", amount: 50, currency: "EUR" },
        ],
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    ];
    render(<FinanceListView items={withEur} />);

    expect(screen.getByText(/no fx rate for eur/i)).toBeInTheDocument();
    expect(screen.getByText("aug note")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(
      screen.getByRole("heading", { name: /edit snapshot/i }),
    ).toBeInTheDocument();
  });

  it("adds, removes, and re-seeds entry rows and blocks an undated snapshot", async () => {
    const user = userEvent.setup();
    render(<FinanceListView items={snapshots} />);
    await user.click(screen.getByRole("button", { name: /new snapshot/i }));

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/snapshot date is required/i)).toBeInTheDocument();
    expect(saveSnapshot).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /add row/i }));
    expect(screen.getByLabelText("Entry 2 place")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /remove entry 2/i }));
    expect(screen.queryByLabelText("Entry 2 place")).not.toBeInTheDocument();
    // Removing the last row re-seeds a single blank row.
    await user.click(screen.getByRole("button", { name: /remove entry 1/i }));
    expect(screen.getByLabelText("Entry 1 place")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("heading", { name: "Finance" }),
    ).toBeInTheDocument();
  });

  it("manages FX rows: add, reject a bad rate, remove, change base", async () => {
    const user = userEvent.setup();
    render(<FinanceListView items={snapshots} />);
    await user.click(screen.getByRole("button", { name: /fx rates/i }));

    await user.click(screen.getByRole("button", { name: /add rate/i }));
    await user.type(screen.getByLabelText("Rate 2 currency"), "EUR");
    await user.type(screen.getByLabelText("Rate 2 value"), "-1");
    await user.click(screen.getByRole("button", { name: /save rates/i }));
    expect(
      screen.getByText(/rate for eur must be zero or greater/i),
    ).toBeInTheDocument();
    expect(updateFinanceSettings).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /remove rate 2/i }));
    await user.clear(screen.getByLabelText("Base currency"));
    await user.type(screen.getByLabelText("Base currency"), "sgd");
    await user.click(screen.getByRole("button", { name: /save rates/i }));
    expect(updateFinanceSettings).toHaveBeenCalledWith({
      baseCurrency: "SGD",
      fxRates: { SGD: 0.74 },
    });
  });

  it("shows the empty-rates hint and filters the table", async () => {
    const user = userEvent.setup();
    const model = createDefaultModel("2026-07-07T00:00:00.000Z");
    model.settings.modules.finance = { enabled: true, baseCurrency: "USD" };
    model.modules.finance = snapshots;
    useVaultStore.setState({
      model,
      saveSnapshot,
      deleteSnapshot,
      updateFinanceSettings,
    });
    render(<FinanceListView items={snapshots} />);

    await user.type(screen.getByLabelText("Filter snapshots"), "nomatch-xyz");
    expect(screen.getByText(/no matches/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Filter snapshots"));
    await user.click(screen.getByRole("button", { name: /fx rates/i }));
    expect(screen.getByText(/no rates yet/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("heading", { name: "Finance" }),
    ).toBeInTheDocument();
  });
});
