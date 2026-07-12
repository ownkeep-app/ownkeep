import { type FormEvent, useMemo, useState } from "react";

import {
  Coins,
  Eye,
  Pencil,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";

import { DatePicker } from "@/components/date-picker";
import { DetailModal } from "@/components/DetailModal";
import {
  DetailFields,
  DetailFieldSpan,
  DetailModalBody,
  DetailModalHero,
} from "@/components/detail-fields";
import { EmptyState } from "@/components/EmptyState";
import { ItemFormShell } from "@/components/ItemFormShell";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencySelect, DEFAULT_CURRENCY } from "@/components/currency-select";
import {
  ActionsTableHead,
  SortableTableHead,
} from "@/components/ui/sortable-table-head";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  nextSortState,
  stableSortBy,
  type SortState,
  type SortValue,
} from "@/lib/table-sort";
import type { ListViewProps } from "@/modules/types";
import { useVaultStore } from "@/stores/vault-store";
import { defaultSettings } from "@/vault/model";
import { TrendChart } from "./TrendChart";
import {
  computeSnapshotStats,
  createSnapshot,
  emptyEntryInput,
  emptySnapshotForm,
  financeSnapshots,
  formatMoney,
  formatSnapshotDate,
  formFromSnapshot,
  netWorthSeries,
  readFinanceFx,
  sortSnapshots,
  updateSnapshot,
  validateSnapshotInput,
  type FinanceFx,
} from "./logic";
import {
  type FinanceEntryInput,
  type Snapshot,
  type SnapshotFormInput,
} from "./types";

export function FinanceListView({ items }: ListViewProps<Snapshot>) {
  const model = useVaultStore((s) => s.model);
  const saveSnapshot = useVaultStore((s) => s.saveSnapshot);
  const deleteSnapshot = useVaultStore((s) => s.deleteSnapshot);
  const settings = model?.settings ?? defaultSettings();

  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState<Snapshot | null>(null);
  const [editing, setEditing] = useState<Snapshot | null | undefined>();
  const [showFx, setShowFx] = useState(false);
  const [sortState, setSortState] =
    useState<SortState<FinanceSortColumn> | null>(null);

  const snapshots = useMemo(() => financeSnapshots(items), [items]);
  const fx = useMemo(() => readFinanceFx(settings), [settings]);
  const series = useMemo(() => netWorthSeries(snapshots, fx), [snapshots, fx]);
  const sorted = useMemo(() => sortSnapshots(snapshots), [snapshots]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const visible = term
      ? sorted.filter((snapshot) =>
          [
            formatSnapshotDate(snapshot.date),
            snapshot.note,
            ...snapshot.entries.flatMap((entry) => [
              entry.place,
              entry.category,
              entry.currency,
            ]),
          ]
            .join(" ")
            .toLowerCase()
            .includes(term),
        )
      : sorted;
    return sortState
      ? stableSortBy(visible, sortState, (snapshot, column) =>
          financeSortValue(snapshot, column, fx),
        )
      : visible;
  }, [sorted, query, sortState, fx]);
  const handleSort = (column: FinanceSortColumn) =>
    setSortState((current) => nextSortState(current, column));

  const startCreate = () => setEditing(null);

  async function handleSave(entry: Snapshot) {
    await saveSnapshot(entry);
    setViewing(null);
    setEditing(undefined);
  }

  async function handleDelete(id: string) {
    await deleteSnapshot(id);
    if (viewing?.id === id) setViewing(null);
  }

  if (editing !== undefined) {
    return (
      <FinanceEditView
        item={editing ?? undefined}
        onCancel={() => setEditing(undefined)}
        onSave={(entry) => void handleSave(entry)}
      />
    );
  }
  if (showFx) {
    return <FxRatesView onClose={() => setShowFx(false)} />;
  }

  const latest = series.length ? series[series.length - 1].total : 0;

  return (
    <div className="flex h-full flex-col overflow-x-hidden">
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold">Finance</h1>
            <p className="text-sm text-muted-foreground">
              {snapshots.length} snapshot{snapshots.length === 1 ? "" : "s"} ·
              net worth {formatMoney(latest, fx.baseCurrency)}
            </p>
          </div>
          <Button
            onClick={() => setShowFx(true)}
            type="button"
            variant="outline"
          >
            <Coins className="h-4 w-4" />
            FX rates
          </Button>
          <Button onClick={startCreate} type="button">
            <Plus className="h-4 w-4" />
            New snapshot
          </Button>
        </div>
      </header>

      <TrendChart currency={fx.baseCurrency} points={series} />

      <div className="flex min-h-0 flex-1 flex-col border-t border-border">
        <div className="border-b border-border p-4">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label="Filter snapshots"
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter snapshots"
              value={query}
            />
          </label>
        </div>

        {filtered.length === 0 ? (
          query.trim() ? (
            <EmptyState
              title="No matches"
              description={`Nothing matches “${query.trim()}”.`}
            />
          ) : (
            <EmptyState
              title="No snapshots yet"
              description="Add a snapshot to start tracking net worth over time."
              action={
                <Button onClick={startCreate} type="button">
                  <Plus className="h-4 w-4" />
                  New snapshot
                </Button>
              }
            />
          )
        ) : (
          <Table className="table-fixed" wrapperClassName="min-h-0 flex-1">
            <TableHeader className="sticky top-0 bg-background text-xs uppercase text-muted-foreground">
              <TableRow>
                <SortableTableHead
                  className="w-[22%] px-4"
                  column="date"
                  label="Date"
                  onSort={handleSort}
                  sort={sortState}
                />
                <SortableTableHead
                  className="w-[40%] px-4"
                  column="netWorth"
                  label="Net worth"
                  onSort={handleSort}
                  sort={sortState}
                />
                <SortableTableHead
                  className="w-[14%] px-4"
                  column="places"
                  label="Places"
                  onSort={handleSort}
                  sort={sortState}
                />
                <ActionsTableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((snapshot) => {
                const stats = computeSnapshotStats(snapshot, fx);
                const dateLabel = formatSnapshotDate(snapshot.date);
                return (
                  <TableRow
                    className="border-b border-border hover:bg-accent/40"
                    key={snapshot.id}
                  >
                    <TableCell className="truncate px-4 py-3 font-medium">
                      {dateLabel}
                    </TableCell>
                    <TableCell className="truncate px-4 py-3 text-muted-foreground">
                      {formatMoney(stats.totalBase, fx.baseCurrency)}
                      {stats.missingCurrencies.length > 0 && (
                        <span className="ml-1 text-xs text-destructive">
                          (+{stats.missingCurrencies.join(", ")})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {snapshot.entries.length}
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      <RowActionsMenu
                        label={`Actions for snapshot ${dateLabel}`}
                        actions={[
                          {
                            label: "View",
                            icon: <Eye className="h-4 w-4" />,
                            onSelect: () => setViewing(snapshot),
                          },
                          {
                            label: "Edit",
                            icon: <Pencil className="h-4 w-4" />,
                            onSelect: () => setEditing(snapshot),
                          },
                          {
                            label: "Delete",
                            icon: <Trash2 className="h-4 w-4" />,
                            destructive: true,
                            onSelect: () => void handleDelete(snapshot.id),
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        <DetailModal
          actions={
            viewing && (
              <>
                <Button
                  onClick={() => {
                    setViewing(null);
                    setEditing(viewing);
                  }}
                  type="button"
                  variant="outline"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
                <Button
                  onClick={() => void handleDelete(viewing.id)}
                  type="button"
                  variant="outline"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </>
            )
          }
          onClose={() => setViewing(null)}
          open={viewing !== null}
          title={viewing ? formatSnapshotDate(viewing.date) : ""}
        >
          {viewing && <FinanceDetailView fx={fx} snapshot={viewing} />}
        </DetailModal>
      </div>
    </div>
  );
}

type FinanceSortColumn = "date" | "netWorth" | "places";

function financeSortValue(
  snapshot: Snapshot,
  column: FinanceSortColumn,
  fx: FinanceFx,
): SortValue {
  if (column === "date") return Date.parse(snapshot.date);
  if (column === "places") return snapshot.entries.length;
  return computeSnapshotStats(snapshot, fx).totalBase;
}

export function FinanceDetailView({
  snapshot,
  fx,
}: {
  snapshot: Snapshot;
  fx: FinanceFx;
}) {
  const stats = computeSnapshotStats(snapshot, fx);
  const categories = Object.entries(stats.byCategory).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <DetailModalBody>
      <DetailModalHero>
        <p className="text-xs uppercase text-muted-foreground">Snapshot</p>
        <div className="mt-1 flex items-start gap-2">
          <TrendingUp className="mt-1 h-4 w-4 text-primary" />
          <h2 className="min-w-0 flex-1 text-lg font-semibold">
            {formatSnapshotDate(snapshot.date)}
          </h2>
        </div>
        <p className="mt-1 text-2xl font-semibold">
          {formatMoney(stats.totalBase, fx.baseCurrency)}
        </p>
      </DetailModalHero>

      {stats.missingCurrencies.length > 0 && (
        <p className="mb-4 text-sm text-destructive">
          No FX rate for {stats.missingCurrencies.join(", ")} — excluded from
          the total. Add a rate under FX rates.
        </p>
      )}

      <DetailFields>
        <div>
          <p className="text-xs uppercase text-muted-foreground">By category</p>
          {categories.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">-</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {categories.map(([category, amount]) => (
                <li className="flex justify-between gap-3" key={category}>
                  <span className="truncate">{category}</span>
                  <span className="text-muted-foreground">
                    {formatMoney(amount, fx.baseCurrency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="text-xs uppercase text-muted-foreground">Holdings</p>
          <ul className="mt-1 space-y-1 text-sm">
            {snapshot.entries.map((entry, index) => (
              <li
                className="flex justify-between gap-3"
                key={`${entry.place}-${index}`}
              >
                <span className="truncate">{entry.place}</span>
                <span className="text-muted-foreground">
                  {formatMoney(entry.amount, entry.currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {snapshot.note && (
          <DetailFieldSpan label="Note" value={snapshot.note} />
        )}
      </DetailFields>
    </DetailModalBody>
  );
}

export function FinanceEditView({
  item,
  onSave,
  onCancel,
}: {
  item?: Snapshot;
  onSave: (item: Snapshot) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<SnapshotFormInput>(
    item ? formFromSnapshot(item) : emptySnapshotForm(),
  );
  const [error, setError] = useState<string | null>(null);

  function updateEntry(
    index: number,
    key: keyof FinanceEntryInput,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      entries: current.entries.map((entry, i) =>
        i === index ? { ...entry, [key]: value } : entry,
      ),
    }));
  }

  function addRow() {
    setForm((current) => ({
      ...current,
      entries: [...current.entries, emptyEntryInput()],
    }));
  }

  function removeRow(index: number) {
    setForm((current) => {
      const entries = current.entries.filter((_, i) => i !== index);
      return {
        ...current,
        entries: entries.length ? entries : [emptyEntryInput()],
      };
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateSnapshotInput(form);
    if (validation) {
      setError(validation);
      return;
    }
    const now = new Date().toISOString();
    onSave(item ? updateSnapshot(item, form, now) : createSnapshot(form, now));
  }

  return (
    <ItemFormShell
      cancelLabel="Close"
      description="Record balances across your accounts."
      error={error}
      mode={item ? "edit" : "create"}
      onCancel={onCancel}
      onSubmit={submit}
      title={item ? "Edit snapshot" : "New snapshot"}
    >
      <label className="space-y-1 text-sm font-medium">
        Date
        <DatePicker
          aria-label="Snapshot date"
          onChange={(date) =>
            setForm((current) => ({ ...current, date }))
          }
          placeholder="Pick a date"
          value={form.date}
        />
      </label>
      <label className="space-y-1 text-sm font-medium">
        Note
        <Input
          aria-label="Snapshot note"
          onChange={(event) =>
            setForm((current) => ({ ...current, note: event.target.value }))
          }
          value={form.note}
        />
      </label>

      <div className="col-span-2 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Holdings</p>
          <Button onClick={addRow} size="sm" type="button" variant="outline">
            <Plus className="h-4 w-4" />
            Add row
          </Button>
        </div>
        {form.entries.map((entry, index) => (
          <div
            className="grid grid-cols-[1fr_1fr_1fr_5rem_2rem] items-center gap-2"
            key={index}
          >
            <Input
              aria-label={`Entry ${index + 1} place`}
              onChange={(event) =>
                updateEntry(index, "place", event.target.value)
              }
              placeholder="Place"
              value={entry.place}
            />
            <Input
              aria-label={`Entry ${index + 1} category`}
              onChange={(event) =>
                updateEntry(index, "category", event.target.value)
              }
              placeholder="Category"
              value={entry.category}
            />
            <Input
              aria-label={`Entry ${index + 1} amount`}
              min={0}
              onChange={(event) =>
                updateEntry(index, "amount", event.target.value)
              }
              placeholder="Amount"
              step="0.01"
              type="number"
              value={entry.amount}
            />
            <CurrencySelect
              aria-label={`Entry ${index + 1} currency`}
              onChange={(event) =>
                updateEntry(index, "currency", event.target.value)
              }
              value={entry.currency}
            />
            <Button
              aria-label={`Remove entry ${index + 1}`}
              onClick={() => removeRow(index)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </ItemFormShell>
  );
}

export function FxRatesView({ onClose }: { onClose: () => void }) {
  const model = useVaultStore((s) => s.model);
  const updateFinanceSettings = useVaultStore((s) => s.updateFinanceSettings);
  const fx = readFinanceFx(model?.settings ?? defaultSettings());

  const [base, setBase] = useState(fx.baseCurrency);
  const [rows, setRows] = useState<{ currency: string; rate: string }[]>(
    Object.entries(fx.rates).map(([currency, rate]) => ({
      currency,
      rate: String(rate),
    })),
  );
  const [error, setError] = useState<string | null>(null);

  function updateRow(index: number, key: "currency" | "rate", value: string) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
  }

  function addRow() {
    setRows((current) => [
      ...current,
      { currency: DEFAULT_CURRENCY, rate: "" },
    ]);
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  async function save() {
    setError(null);
    const rates: Record<string, number> = {};
    for (const row of rows) {
      const currency = row.currency.trim().toUpperCase();
      if (!currency) continue;
      const rate = Number(row.rate);
      if (!Number.isFinite(rate) || rate < 0) {
        setError(`Rate for ${currency} must be zero or greater.`);
        return;
      }
      rates[currency] = rate;
    }
    await updateFinanceSettings({
      baseCurrency: base.trim().toUpperCase() || DEFAULT_CURRENCY,
      fxRates: rates,
    });
    onClose();
  }

  const baseLabel = base.trim().toUpperCase() || DEFAULT_CURRENCY;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">FX rates</h1>
          <p className="text-sm text-muted-foreground">
            Manual rates: the base-currency value of 1 unit of each currency.
            Editing re-totals every snapshot.
          </p>
        </div>
        <Button
          aria-label="Close FX rates"
          onClick={onClose}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex-1 space-y-4 overflow-auto p-6">
        <label className="block max-w-xs space-y-1 text-sm font-medium">
          Base currency
          <CurrencySelect
            aria-label="Base currency"
            onChange={(event) => setBase(event.target.value)}
            value={base}
          />
        </label>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Rates (1 unit → {baseLabel})</p>
            <Button onClick={addRow} size="sm" type="button" variant="outline">
              <Plus className="h-4 w-4" />
              Add rate
            </Button>
          </div>
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No rates yet. Amounts already in {baseLabel} need none.
            </p>
          )}
          {rows.map((row, index) => (
            <div
              className="grid grid-cols-[1fr_1fr_2rem] items-center gap-2"
              key={index}
            >
              <CurrencySelect
                aria-label={`Rate ${index + 1} currency`}
                onChange={(event) =>
                  updateRow(index, "currency", event.target.value)
                }
                value={row.currency}
              />
              <Input
                aria-label={`Rate ${index + 1} value`}
                min={0}
                onChange={(event) =>
                  updateRow(index, "rate", event.target.value)
                }
                placeholder="Rate"
                step="0.0001"
                type="number"
                value={row.rate}
              />
              <Button
                aria-label={`Remove rate ${index + 1}`}
                onClick={() => removeRow(index)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <footer className="flex justify-end gap-2 border-t border-border px-6 py-4">
        <Button onClick={onClose} type="button" variant="outline">
          Cancel
        </Button>
        <Button onClick={() => void save()} type="button">
          Save rates
        </Button>
      </footer>
    </div>
  );
}
