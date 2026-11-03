import { type FormEvent, useMemo, useState } from "react";

import {
  Coins,
  Copy,
  Eye,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
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
import { ClearFiltersButton } from "@/components/ClearFiltersButton";
import { ListItemTitle } from "@/components/ListItemTitle";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CurrencySelect, DEFAULT_CURRENCY } from "@/components/currency-select";
import {
  ActionsTableHead,
  IndexTableCell,
  IndexTableHead,
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
import { toastSuccess } from "@/lib/toast";
import { useClearFiltersOnEscape } from "@/hooks/use-clear-filters-on-escape";
import type { ListViewProps } from "@/modules/types";
import { useT } from "@/i18n";
import { useVaultStore } from "@/stores/vault-store";
import { defaultSettings } from "@/vault/model";
import { optionsWithExtras } from "@/vault/taxonomy";
import { TrendChart } from "./TrendChart";
import {
  computeSnapshotStats,
  createSnapshot,
  duplicateSnapshotForm,
  emptyEntryInput,
  emptySnapshotForm,
  financeSnapshots,
  formatMoney,
  formatSnapshotDate,
  formFromSnapshot,
  netWorthSeries,
  parseFinanceOptionLines,
  readFinanceFx,
  readFinanceTaxonomy,
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
  const { t, tp } = useT();
  const model = useVaultStore((s) => s.model);
  const saveSnapshot = useVaultStore((s) => s.saveSnapshot);
  const deleteSnapshot = useVaultStore((s) => s.deleteSnapshot);
  const settings = model?.settings ?? defaultSettings();

  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState<Snapshot | null>(null);
  const [editing, setEditing] = useState<Snapshot | null | undefined>();
  const [createDraft, setCreateDraft] = useState<SnapshotFormInput | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [showFx, setShowFx] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sortState, setSortState] =
    useState<SortState<FinanceSortColumn> | null>(null);

  const snapshots = useMemo(() => financeSnapshots(items), [items]);
  const fx = useMemo(() => readFinanceFx(settings), [settings]);
  const taxonomy = useMemo(() => readFinanceTaxonomy(settings), [settings]);
  const series = useMemo(() => netWorthSeries(snapshots, fx), [snapshots, fx]);
  const sorted = useMemo(() => sortSnapshots(snapshots), [snapshots]);
  const latestSnapshot = sorted[0] ?? null;
  const filtersActive = Boolean(query.trim());
  useClearFiltersOnEscape(filtersActive, () => setQuery(""));
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const visible = term
      ? sorted.filter((snapshot) =>
          [
            formatSnapshotDate(snapshot.date),
            snapshot.note,
            ...snapshot.entries.flatMap((entry) => [
              entry.place,
              entry.holder,
              entry.category,
              entry.currency,
              entry.dueDate ? formatSnapshotDate(entry.dueDate) : "",
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

  const startCreate = () => {
    setCreateDraft(null);
    setEditing(null);
  };

  const startDuplicateLast = () => {
    if (!latestSnapshot) return;
    setCreateDraft(duplicateSnapshotForm(latestSnapshot, taxonomy));
    setEditing(null);
  };

  async function handleSave(entry: Snapshot) {
    await saveSnapshot(entry);
    setViewing(null);
    setCreateDraft(null);
    setEditing(undefined);
  }

  async function handleDelete(id: string) {
    await deleteSnapshot(id);
    if (viewing?.id === id) setViewing(null);
    setPendingDelete(null);
  }

  if (editing !== undefined) {
    return (
      <FinanceEditView
        draft={editing ? undefined : (createDraft ?? undefined)}
        item={editing ?? undefined}
        onCancel={() => {
          setCreateDraft(null);
          setEditing(undefined);
        }}
        onSave={(entry) => void handleSave(entry)}
      />
    );
  }
  if (showFx) {
    return <FxRatesView onClose={() => setShowFx(false)} />;
  }
  if (showSettings) {
    return <FinanceSettingsView onClose={() => setShowSettings(false)} />;
  }

  const latest = series.length ? series[series.length - 1].total : 0;

  return (
    <div className="relative flex h-full flex-col overflow-x-hidden">
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold">{t("module.finance")}</h1>
            <p className="text-sm text-muted-foreground">
              {tp("finance.summary", snapshots.length, {
                netWorth: formatMoney(latest, fx.baseCurrency),
              })}
            </p>
          </div>
          <Button
            onClick={() => setShowSettings(true)}
            type="button"
            variant="outline"
          >
            <Settings2 className="h-4 w-4" />
            {t("dashboard.settings")}
          </Button>
          <Button
            onClick={() => setShowFx(true)}
            type="button"
            variant="outline"
          >
            <Coins className="h-4 w-4" />
            {t("finance.fxRates")}
          </Button>
          <Button onClick={startCreate} type="button">
            <Plus className="h-4 w-4" />
            {t("finance.newSnapshot")}
          </Button>
        </div>
      </header>

      <TrendChart currency={fx.baseCurrency} points={series} />

      <div className="flex min-h-0 flex-1 flex-col border-t border-border">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <label className="relative block min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label={t("finance.filter")}
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("finance.filter")}
              value={query}
            />
          </label>
          {filtersActive ? (
            <ClearFiltersButton onClear={() => setQuery("")} />
          ) : null}
        </div>

        {filtered.length === 0 ? (
          query.trim() ? (
            <EmptyState
              title={t("common.noMatches")}
              description={t("common.nothingMatches", { query: query.trim() })}
            />
          ) : (
            <EmptyState
              title={t("finance.emptyTitle")}
              description={t("finance.emptyBody")}
              action={
                <Button onClick={startCreate} type="button">
                  <Plus className="h-4 w-4" />
                  {t("finance.newSnapshot")}
                </Button>
              }
            />
          )
        ) : (
          <Table className="table-fixed" wrapperClassName="min-h-0 flex-1">
            <TableHeader className="sticky top-0 bg-background text-xs uppercase text-muted-foreground">
              <TableRow>
                <IndexTableHead />
                <SortableTableHead
                  className="w-[22%] px-4"
                  column="date"
                  label={t("finance.date")}
                  onSort={handleSort}
                  sort={sortState}
                />
                <SortableTableHead
                  className="w-[40%] px-4"
                  column="netWorth"
                  label={t("finance.netWorth")}
                  onSort={handleSort}
                  sort={sortState}
                />
                <SortableTableHead
                  className="w-[14%] px-4"
                  column="places"
                  label={t("finance.places")}
                  onSort={handleSort}
                  sort={sortState}
                />
                <ActionsTableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((snapshot, index) => {
                const stats = computeSnapshotStats(snapshot, fx);
                const dateLabel = formatSnapshotDate(snapshot.date);
                return (
                  <TableRow
                    className="border-b border-border hover:bg-accent/40"
                    key={snapshot.id}
                  >
                    <IndexTableCell index={index + 1} />
                    <TableCell className="truncate px-4 py-3">
                      <ListItemTitle
                        className="truncate"
                        onOpen={() => setViewing(snapshot)}
                      >
                        {dateLabel}
                      </ListItemTitle>
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
                        label={t("finance.actionsFor", { date: dateLabel })}
                        actions={[
                          {
                            label: t("common.view"),
                            icon: <Eye className="h-4 w-4" />,
                            onSelect: () => setViewing(snapshot),
                          },
                          {
                            label: t("common.edit"),
                            icon: <Pencil className="h-4 w-4" />,
                            onSelect: () => setEditing(snapshot),
                          },
                          {
                            label: t("common.delete"),
                            icon: <Trash2 className="h-4 w-4" />,
                            destructive: true,
                            onSelect: () =>
                              setPendingDelete({
                                id: snapshot.id,
                                name: dateLabel,
                              }),
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
                  onClick={() =>
                    setPendingDelete({
                      id: viewing.id,
                      name: formatSnapshotDate(viewing.date),
                    })
                  }
                  type="button"
                  variant="destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  {t("common.delete")}
                </Button>
                <Button
                  className="ml-auto"
                  onClick={() => {
                    setViewing(null);
                    setEditing(viewing);
                  }}
                  type="button"
                  variant="outline"
                >
                  <Pencil className="h-4 w-4" />
                  {t("common.edit")}
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

        <ConfirmDeleteDialog
          itemName={pendingDelete?.name ?? ""}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            if (pendingDelete) void handleDelete(pendingDelete.id);
          }}
          open={pendingDelete !== null}
        />

        {latestSnapshot ? (
          <Button
            aria-label={t("finance.duplicateLastLabel")}
            className="absolute bottom-4 right-4 z-20 shadow-lg"
            onClick={startDuplicateLast}
            type="button"
          >
            <Copy className="h-4 w-4" />
            {t("finance.duplicateLast")}
          </Button>
        ) : null}
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
  const { t } = useT();
  const stats = computeSnapshotStats(snapshot, fx);
  const categories = Object.entries(stats.byCategory).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <DetailModalBody>
      <DetailModalHero>
        <p className="text-xs uppercase text-muted-foreground">
          {t("finance.snapshot")}
        </p>
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
          {t("finance.missingFx", {
            currencies: stats.missingCurrencies.join(", "),
          })}
        </p>
      )}

      <DetailFields>
        <div>
          <p className="text-xs uppercase text-muted-foreground">
            {t("finance.byCategory")}
          </p>
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
          <p className="text-xs uppercase text-muted-foreground">
            {t("finance.holdings")}
          </p>
          <ul className="mt-1 space-y-1 text-sm">
            {snapshot.entries.map((entry, index) => (
              <li
                className="flex justify-between gap-3"
                key={`${entry.place}-${index}`}
              >
                <span className="min-w-0 truncate">
                  {entry.place}
                  <span className="text-muted-foreground">
                    {" "}
                    · {entry.holder} · {entry.category}
                    {entry.dueDate
                      ? ` · ${t("todos.dueLower", { date: formatSnapshotDate(entry.dueDate) })}`
                      : ""}
                  </span>
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatMoney(entry.amount, entry.currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {snapshot.note && (
          <DetailFieldSpan label={t("finance.note")} value={snapshot.note} />
        )}
      </DetailFields>
    </DetailModalBody>
  );
}

export function FinanceEditView({
  item,
  draft,
  onSave,
  onCancel,
}: {
  item?: Snapshot;
  /** Prefill for create (e.g. duplicate-last); ignored when editing an item. */
  draft?: SnapshotFormInput;
  onSave: (item: Snapshot) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const model = useVaultStore((s) => s.model);
  const taxonomy = useMemo(
    () => readFinanceTaxonomy(model?.settings ?? defaultSettings()),
    [model?.settings],
  );
  const [form, setForm] = useState<SnapshotFormInput>(
    item
      ? formFromSnapshot(item, taxonomy)
      : (draft ?? emptySnapshotForm(taxonomy)),
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
      entries: [...current.entries, emptyEntryInput(taxonomy)],
    }));
  }

  function removeRow(index: number) {
    setForm((current) => {
      const entries = current.entries.filter((_, i) => i !== index);
      return {
        ...current,
        entries: entries.length ? entries : [emptyEntryInput(taxonomy)],
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
      cancelLabel={t("common.close")}
      description={t("finance.formHint")}
      error={error}
      mode={item ? "edit" : "create"}
      onCancel={onCancel}
      onSubmit={submit}
      title={t(item ? "finance.editSnapshot" : "finance.newSnapshot")}
    >
      <label className="space-y-1 text-sm font-medium">
        {t("finance.date")}
        <DatePicker
          aria-label={t("finance.dateLabel")}
          onChange={(date) => setForm((current) => ({ ...current, date }))}
          placeholder={t("picker.pickDate")}
          value={form.date}
        />
      </label>
      <label className="col-span-2 space-y-1 text-sm font-medium">
        {t("finance.note")}
        <textarea
          aria-label={t("finance.noteLabel")}
          className="min-h-24 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) =>
            setForm((current) => ({ ...current, note: event.target.value }))
          }
          value={form.note}
        />
      </label>

      <div className="col-span-2 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{t("finance.holdings")}</p>
          <Button onClick={addRow} size="sm" type="button" variant="outline">
            <Plus className="h-4 w-4" />
            {t("finance.addRow")}
          </Button>
        </div>
        {form.entries.map((entry, index) => {
          const holderChoices = optionsWithExtras(
            taxonomy.holderOptions,
            entry.holder,
          );
          const categoryChoices = optionsWithExtras(
            taxonomy.categoryOptions,
            entry.category,
          );
          return (
            <div className="space-y-2" key={index}>
              <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_5rem_2rem] items-center gap-2">
                <Input
                  aria-label={t("finance.entryPlace", { n: index + 1 })}
                  onChange={(event) =>
                    updateEntry(index, "place", event.target.value)
                  }
                  placeholder={t("finance.place")}
                  value={entry.place}
                />
                <Select
                  aria-label={t("finance.entryHolder", { n: index + 1 })}
                  onChange={(event) =>
                    updateEntry(index, "holder", event.target.value)
                  }
                  value={entry.holder}
                >
                  {holderChoices.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
                <Select
                  aria-label={t("finance.entryCategory", { n: index + 1 })}
                  onChange={(event) =>
                    updateEntry(index, "category", event.target.value)
                  }
                  value={entry.category}
                >
                  {categoryChoices.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
                <Input
                  aria-label={t("finance.entryAmount", { n: index + 1 })}
                  min={0}
                  onChange={(event) =>
                    updateEntry(index, "amount", event.target.value)
                  }
                  placeholder={t("field.amount")}
                  step="0.01"
                  type="number"
                  value={entry.amount}
                />
                <CurrencySelect
                  aria-label={t("finance.entryCurrency", { n: index + 1 })}
                  onChange={(event) =>
                    updateEntry(index, "currency", event.target.value)
                  }
                  value={entry.currency}
                />
                <Button
                  aria-label={t("finance.removeEntry", { n: index + 1 })}
                  onClick={() => removeRow(index)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <DatePicker
                aria-label={t("finance.entryDueDate", { n: index + 1 })}
                clearable
                className="max-w-xs"
                onChange={(date) => updateEntry(index, "dueDate", date)}
                placeholder={t("finance.dueDateOptional")}
                value={entry.dueDate}
              />
            </div>
          );
        })}
      </div>
    </ItemFormShell>
  );
}

export function FxRatesView({ onClose }: { onClose: () => void }) {
  const { t } = useT();
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
        setError(t("finance.rateNonNegative", { currency }));
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
          <h1 className="text-lg font-semibold">{t("finance.fxRates")}</h1>
          <p className="text-sm text-muted-foreground">{t("finance.fxHint")}</p>
        </div>
        <Button
          aria-label={t("finance.closeFx")}
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
          {t("finance.baseCurrency")}
          <CurrencySelect
            aria-label={t("finance.baseCurrency")}
            onChange={(event) => setBase(event.target.value)}
            value={base}
          />
        </label>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {t("finance.ratesHeading", { base: baseLabel })}
            </p>
            <Button onClick={addRow} size="sm" type="button" variant="outline">
              <Plus className="h-4 w-4" />
              {t("finance.addRate")}
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
                aria-label={t("finance.rateCurrency", { n: index + 1 })}
                onChange={(event) =>
                  updateRow(index, "currency", event.target.value)
                }
                value={row.currency}
              />
              <Input
                aria-label={t("finance.rateValue", { n: index + 1 })}
                min={0}
                onChange={(event) =>
                  updateRow(index, "rate", event.target.value)
                }
                placeholder={t("finance.rate")}
                step="0.0001"
                type="number"
                value={row.rate}
              />
              <Button
                aria-label={t("finance.removeRate", { n: index + 1 })}
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
          {t("common.cancel")}
        </Button>
        <Button onClick={() => void save()} type="button">
          {t("finance.saveRates")}
        </Button>
      </footer>
    </div>
  );
}

/** Finance-only holder and category option lists for snapshot holdings. */
export function FinanceSettingsView({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const model = useVaultStore((s) => s.model);
  const updateFinanceSettings = useVaultStore((s) => s.updateFinanceSettings);
  const taxonomy = readFinanceTaxonomy(model?.settings ?? defaultSettings());

  const [holderOptionsText, setHolderOptionsText] = useState(
    taxonomy.holderOptions.join("\n"),
  );
  const [categoryOptionsText, setCategoryOptionsText] = useState(
    taxonomy.categoryOptions.join("\n"),
  );
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const holderOptions = parseFinanceOptionLines(holderOptionsText);
    const categoryOptions = parseFinanceOptionLines(categoryOptionsText);
    if (holderOptions.length === 0 || categoryOptions.length === 0) {
      setError(t("finance.settingsEmpty"));
      return;
    }
    setHolderOptionsText(holderOptions.join("\n"));
    setCategoryOptionsText(categoryOptions.join("\n"));
    await updateFinanceSettings({ holderOptions, categoryOptions });
    toastSuccess(t("finance.settingsSaved"));
    onClose();
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">{t("finance.settings")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("finance.settingsHint")}
          </p>
        </div>
        <Button
          aria-label={t("finance.closeSettings")}
          onClick={onClose}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex-1 space-y-6 overflow-auto p-6">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t("finance.holderOptions")}</span>
          <span className="text-xs text-muted-foreground">
            {t("finance.holderOptionsHint")}
          </span>
          <textarea
            aria-label={t("finance.holderOptions")}
            className="min-h-28 rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => setHolderOptionsText(event.target.value)}
            value={holderOptionsText}
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t("settings.categoryOptions")}</span>
          <span className="text-xs text-muted-foreground">
            {t("finance.categoryOptionsHint")}
          </span>
          <textarea
            aria-label={t("finance.categoryOptionsLabel")}
            className="min-h-36 rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => setCategoryOptionsText(event.target.value)}
            value={categoryOptionsText}
          />
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <footer className="flex justify-end gap-2 border-t border-border px-6 py-4">
        <Button onClick={onClose} type="button" variant="outline">
          {t("common.cancel")}
        </Button>
        <Button onClick={() => void save()} type="button">
          {t("finance.saveSettings")}
        </Button>
      </footer>
    </div>
  );
}
