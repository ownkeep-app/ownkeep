import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chooseRowAction } from "@/test/row-actions";
import { pickDate } from "@/test/date-picker";
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

  it("sorts rows by derived net worth", async () => {
    const user = userEvent.setup();
    render(
      <FinanceListView
        items={[
          ...snapshots,
          {
            id: "s3",
            date: "2026-05-01T00:00:00.000Z",
            note: "may",
            entries: [
              {
                place: "Wallet",
                category: "cash",
                amount: 50,
                currency: "USD",
              },
            ],
            updatedAt: "2026-05-01T00:00:00.000Z",
          },
        ]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /sort net worth ascending/i }),
    );
    expect(financeRowDates()).toEqual([
      "May 1, 2026",
      "Jun 1, 2026",
      "Jul 1, 2026",
    ]);

    await user.click(
      screen.getByRole("button", { name: /sort net worth descending/i }),
    );
    expect(financeRowDates()).toEqual([
      "Jul 1, 2026",
      "Jun 1, 2026",
      "May 1, 2026",
    ]);

    await user.click(
      screen.getByRole("button", { name: /sort date ascending/i }),
    );
    expect(financeRowDates()).toEqual([
      "May 1, 2026",
      "Jun 1, 2026",
      "Jul 1, 2026",
    ]);

    await user.click(
      screen.getByRole("button", { name: /sort places ascending/i }),
    );
    expect(financeRowDates()).toEqual([
      "Jun 1, 2026",
      "May 1, 2026",
      "Jul 1, 2026",
    ]);
  });

  it("adds a snapshot through the form", async () => {
    const user = userEvent.setup();
    render(<FinanceListView items={snapshots} />);
    await user.click(screen.getByRole("button", { name: /new snapshot/i }));
    await pickDate(user, "Snapshot date", "2026-08-01");
    await user.type(screen.getByLabelText("Entry 1 place"), "Cash");
    await user.type(screen.getByLabelText("Entry 1 amount"), "500");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(saveSnapshot).toHaveBeenCalledTimes(1);
    const saved = saveSnapshot.mock.calls[0][0];
    expect(saved.date).toBe(
      new Date(2026, 7, 1, 23, 59, 59, 0).toISOString(),
    );
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
    await chooseRowAction(user, "snapshot Jul", "Delete");
    expect(deleteSnapshot).toHaveBeenCalledWith("s2");
  });

  it("runs detail close and delete actions", async () => {
    const user = userEvent.setup();
    render(<FinanceListView items={snapshots} />);

    await chooseRowAction(user, "snapshot Jul 1, 2026", "View");
    let dialog = screen.getByRole("dialog", { name: /jul 1, 2026/i });
    await user.click(
      within(dialog).getByRole("button", { name: /close details/i }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /jul 1, 2026/i }),
      ).not.toBeInTheDocument(),
    );

    await chooseRowAction(user, "snapshot Jul 1, 2026", "View");
    dialog = screen.getByRole("dialog", { name: /jul 1, 2026/i });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
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

    await chooseRowAction(user, "snapshot Aug 1, 2026", "View");
    const dialog = screen.getByRole("dialog", { name: /aug 1, 2026/i });
    expect(within(dialog).getByText(/no fx rate for eur/i)).toBeInTheDocument();
    expect(within(dialog).getByText("aug note")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Edit" }));
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
    await user.selectOptions(screen.getByLabelText("Rate 2 currency"), "USD");
    await user.type(screen.getByLabelText("Rate 2 value"), "-1");
    await user.click(screen.getByRole("button", { name: /save rates/i }));
    expect(
      screen.getByText(/rate for usd must be zero or greater/i),
    ).toBeInTheDocument();
    expect(updateFinanceSettings).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /remove rate 2/i }));
    await user.selectOptions(screen.getByLabelText("Base currency"), "CNY");
    await user.click(screen.getByRole("button", { name: /save rates/i }));
    expect(updateFinanceSettings).toHaveBeenCalledWith({
      baseCurrency: "CNY",
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

function financeRowDates(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent ?? "");
}
