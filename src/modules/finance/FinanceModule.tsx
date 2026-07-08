import { type FormEvent, useMemo, useState } from "react";

import {
  Coins,
  Pencil,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
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
import type { FinanceEntryInput, Snapshot, SnapshotFormInput } from "./types";

export function FinanceListView({ items }: ListViewProps<Snapshot>) {
  const model = useVaultStore((s) => s.model);
  const saveSnapshot = useVaultStore((s) => s.saveSnapshot);
  const deleteSnapshot = useVaultStore((s) => s.deleteSnapshot);
  const settings = model?.settings ?? defaultSettings();

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Snapshot | null | undefined>();
  const [showFx, setShowFx] = useState(false);

  const snapshots = useMemo(() => financeSnapshots(items), [items]);
  const fx = useMemo(() => readFinanceFx(settings), [settings]);
  const series = useMemo(() => netWorthSeries(snapshots, fx), [snapshots, fx]);
  const sorted = useMemo(() => sortSnapshots(snapshots), [snapshots]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return sorted;
    return sorted.filter((snapshot) =>
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
    );
  }, [sorted, query]);
  const selected =
    snapshots.find((snapshot) => snapshot.id === selectedId) ??
    filtered[0] ??
    null;

  const startCreate = () => setEditing(null);

  async function handleSave(entry: Snapshot) {
    await saveSnapshot(entry);
    setSelectedId(entry.id);
    setEditing(undefined);
  }

  async function handleDelete(id: string) {
    await deleteSnapshot(id);
    if (selectedId === id) setSelectedId(null);
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
    <div className="flex h-full flex-col">
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

      <div className="flex min-h-0 flex-1 border-t border-border">
        <div className="flex min-w-0 flex-1 flex-col">
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
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full table-fixed text-sm">
                <thead className="sticky top-0 bg-background text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="w-4/12 px-4 py-2 font-medium" scope="col">
                      Date
                    </th>
                    <th className="w-5/12 px-4 py-2 font-medium" scope="col">
                      Net worth
                    </th>
                    <th className="w-2/12 px-4 py-2 font-medium" scope="col">
                      Places
                    </th>
                    <th className="w-24 px-4 py-2 font-medium" scope="col">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((snapshot) => {
                    const stats = computeSnapshotStats(snapshot, fx);
                    return (
                      <tr
                        className={
                          selected?.id === snapshot.id
                            ? "border-b border-border bg-accent/60"
                            : "border-b border-border hover:bg-accent/40"
                        }
                        key={snapshot.id}
                      >
                        <td className="truncate px-4 py-3">
                          <button
                            className="max-w-full truncate text-left font-medium"
                            onClick={() => setSelectedId(snapshot.id)}
                            type="button"
                          >
                            {formatSnapshotDate(snapshot.date)}
                          </button>
                        </td>
                        <td className="truncate px-4 py-3 text-muted-foreground">
                          {formatMoney(stats.totalBase, fx.baseCurrency)}
                          {stats.missingCurrencies.length > 0 && (
                            <span className="ml-1 text-xs text-destructive">
                              (+{stats.missingCurrencies.join(", ")})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {snapshot.entries.length}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex justify-end gap-1">
                            <Button
                              aria-label={`Edit snapshot ${formatSnapshotDate(snapshot.date)}`}
                              onClick={() => setEditing(snapshot)}
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              aria-label={`Delete snapshot ${formatSnapshotDate(snapshot.date)}`}
                              onClick={() => void handleDelete(snapshot.id)}
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="w-80 border-l border-border">
          {selected ? (
            <FinanceDetailView
              fx={fx}
              onEdit={() => setEditing(selected)}
              snapshot={selected}
            />
          ) : (
            <div className="p-6 text-sm text-muted-foreground">
              Select a snapshot to see its breakdown.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export function FinanceDetailView({
  snapshot,
  fx,
  onEdit,
}: {
  snapshot: Snapshot;
  fx: FinanceFx;
  onEdit?: () => void;
}) {
  const stats = computeSnapshotStats(snapshot, fx);
  const categories = Object.entries(stats.byCategory).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <div className="space-y-5 p-6">
      <div>
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
      </div>

      {stats.missingCurrencies.length > 0 && (
        <p className="text-sm text-destructive">
          No FX rate for {stats.missingCurrencies.join(", ")} — excluded from
          the total. Add a rate under FX rates.
        </p>
      )}

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
        <div>
          <p className="text-xs uppercase text-muted-foreground">Note</p>
          <p className="mt-1 break-words text-sm">{snapshot.note}</p>
        </div>
      )}

      {onEdit && (
        <Button onClick={onEdit} type="button" variant="outline">
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
      )}
    </div>
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
    <form className="flex h-full flex-col" onSubmit={submit}>
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">
            {item ? "Edit snapshot" : "New snapshot"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Record balances across your accounts.
          </p>
        </div>
        <Button
          aria-label="Close"
          onClick={onCancel}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex-1 space-y-4 overflow-auto p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            Date
            <Input
              aria-label="Snapshot date"
              onChange={(event) =>
                setForm((current) => ({ ...current, date: event.target.value }))
              }
              type="date"
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
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Holdings</p>
            <Button onClick={addRow} size="sm" type="button" variant="outline">
              <Plus className="h-4 w-4" />
              Add row
            </Button>
          </div>
          {form.entries.map((entry, index) => (
            <div
              className="grid grid-cols-[1fr_1fr_1fr_4rem_2rem] items-center gap-2"
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
              <Input
                aria-label={`Entry ${index + 1} currency`}
                maxLength={8}
                onChange={(event) =>
                  updateEntry(index, "currency", event.target.value)
                }
                placeholder="Cur"
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

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <footer className="flex justify-end gap-2 border-t border-border px-6 py-4">
        <Button onClick={onCancel} type="button" variant="outline">
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </footer>
    </form>
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
    setRows((current) => [...current, { currency: "", rate: "" }]);
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
      baseCurrency: base.trim().toUpperCase() || "USD",
      fxRates: rates,
    });
    onClose();
  }

  const baseLabel = base.trim().toUpperCase() || "USD";

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
          <Input
            aria-label="Base currency"
            maxLength={8}
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
              <Input
                aria-label={`Rate ${index + 1} currency`}
                maxLength={8}
                onChange={(event) =>
                  updateRow(index, "currency", event.target.value)
                }
                placeholder="Currency"
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
