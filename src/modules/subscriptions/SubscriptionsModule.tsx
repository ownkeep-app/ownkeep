import { type FormEvent, useEffect, useMemo, useState } from "react";

import {
  CalendarDays,
  CreditCard,
  ExternalLink,
  Eye,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { CategorySelect } from "@/components/category-select";
import { DatePicker } from "@/components/date-picker";
import { DetailModal } from "@/components/DetailModal";
import {
  DetailField,
  DetailFields,
  DetailFieldSpan,
  DetailModalBody,
  DetailModalHero,
  DetailUrlField,
} from "@/components/detail-fields";
import { EmptyState } from "@/components/EmptyState";
import { ItemFormShell } from "@/components/ItemFormShell";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { TagMultiSelect } from "@/components/tag-multi-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CurrencySelect } from "@/components/currency-select";
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
import { useTaxonomySettings } from "@/hooks/use-taxonomy-settings";
import type { ListViewProps } from "@/modules/types";
import { useVaultStore } from "@/stores/vault-store";
import { cn } from "@/lib/utils";
import { defaultSettings } from "@/vault/model";
import {
  advanceNextDueDate,
  createSubscriptionEntry,
  emptySubscriptionForm,
  formatCurrencyAmount,
  formatDate,
  formFromSubscription,
  sortSubscriptions,
  subscriptionEntries,
  summarizeSubscriptions,
  updateSubscriptionEntry,
  validateSubscriptionInput,
} from "./logic";
import {
  SUBSCRIPTION_CYCLES,
  type SubscriptionEntry,
  type SubscriptionFormInput,
} from "./types";

export function SubscriptionsListView({
  items,
  focusItemId,
  onFocusItemHandled,
}: ListViewProps<SubscriptionEntry>) {
  const model = useVaultStore((s) => s.model);
  const saveSubscription = useVaultStore((s) => s.saveSubscription);
  const deleteSubscription = useVaultStore((s) => s.deleteSubscription);
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState<SubscriptionEntry | null>(null);
  const [editing, setEditing] = useState<
    SubscriptionEntry | null | undefined
  >();
  const [sortState, setSortState] =
    useState<SortState<SubscriptionSortColumn> | null>(null);

  const subscriptions = useMemo(() => subscriptionEntries(items), [items]);
  const summary = useMemo(
    () =>
      summarizeSubscriptions(
        subscriptions,
        model?.settings ?? defaultSettings(),
      ),
    [subscriptions, model?.settings],
  );
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const sorted = sortSubscriptions(subscriptions);
    const visible = term
      ? sorted.filter((item) =>
          [item.service, item.url, item.currency, item.cycle, item.notes]
            .join(" ")
            .toLowerCase()
            .includes(term),
        )
      : sorted;
    return sortState
      ? stableSortBy(visible, sortState, subscriptionSortValue)
      : visible;
  }, [subscriptions, query, sortState]);
  const handleSort = (column: SubscriptionSortColumn) =>
    setSortState((current) => nextSortState(current, column));

  useEffect(() => {
    if (!focusItemId) return;
    const item = subscriptions.find(
      (subscription) => subscription.id === focusItemId,
    );
    if (!item) return;
    setViewing(item);
    onFocusItemHandled?.();
  }, [focusItemId, subscriptions, onFocusItemHandled]);

  const startCreate = () => setEditing(null);

  async function handleSave(entry: SubscriptionEntry) {
    await saveSubscription(entry);
    setViewing(null);
    setEditing(undefined);
  }

  async function handleDelete(id: string) {
    await deleteSubscription(id);
    if (viewing?.id === id) setViewing(null);
  }

  async function handleAdvance(item: SubscriptionEntry) {
    const nextDueDate = advanceNextDueDate(
      item.nextDueDate,
      item.cycle,
      item.customIntervalDays,
    );
    if (!nextDueDate) return;
    await saveSubscription({
      ...item,
      nextDueDate,
      updatedAt: new Date().toISOString(),
    });
    setViewing((current) =>
      current?.id === item.id
        ? { ...item, nextDueDate, updatedAt: new Date().toISOString() }
        : current,
    );
  }

  if (editing !== undefined) {
    return (
      <SubscriptionEditView
        item={editing ?? undefined}
        onCancel={() => setEditing(undefined)}
        onSave={(entry) => void handleSave(entry)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold">Subscriptions</h1>
            <p className="text-sm text-muted-foreground">
              {subscriptions.length} tracked service
              {subscriptions.length === 1 ? "" : "s"}
            </p>
          </div>
          <Button onClick={startCreate}>
            <Plus className="h-4 w-4" />
            New
          </Button>
        </div>
        <SummaryStrip summary={summary} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border p-4">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label="Filter subscriptions"
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter subscriptions"
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
              title="No subscriptions yet"
              description="Track a recurring service to get renewal reminders."
              action={
                <Button onClick={startCreate}>
                  <Plus className="h-4 w-4" />
                  New subscription
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
                  column="service"
                  label="Service"
                  onSort={handleSort}
                  sort={sortState}
                />
                <SortableTableHead
                  className="w-[14%] px-4"
                  column="amount"
                  label="Amount"
                  onSort={handleSort}
                  sort={sortState}
                />
                <SortableTableHead
                  className="w-[12%] px-4"
                  column="cycle"
                  label="Cycle"
                  onSort={handleSort}
                  sort={sortState}
                />
                <SortableTableHead
                  className="w-[18%] px-4"
                  column="nextDue"
                  label="Next due"
                  onSort={handleSort}
                  sort={sortState}
                />
                <SortableTableHead
                  className="w-[12%] px-4"
                  column="renew"
                  label="Renew"
                  onSort={handleSort}
                  sort={sortState}
                />
                <ActionsTableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow
                  className="border-b border-border hover:bg-accent/40"
                  key={item.id}
                >
                  <TableCell className="truncate px-4 py-3 font-medium">
                    {item.service}
                  </TableCell>
                  <TableCell className="truncate px-4 py-3 text-muted-foreground">
                    {formatCurrencyAmount(item.amount, item.currency)}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <CyclePill cycle={item.cycle} />
                  </TableCell>
                  <TableCell className="truncate px-4 py-3 text-muted-foreground">
                    {formatDate(item.nextDueDate)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    {item.autoRenew ? "Auto" : "Manual"}
                  </TableCell>
                  <TableCell className="px-2 py-2">
                    <RowActionsMenu
                      label={`Actions for ${item.service}`}
                      actions={[
                        {
                          label: "View",
                          icon: <Eye className="h-4 w-4" />,
                          onSelect: () => setViewing(item),
                        },
                        {
                          label: "Advance due date",
                          icon: <CalendarDays className="h-4 w-4" />,
                          onSelect: () => void handleAdvance(item),
                        },
                        {
                          label: "Edit",
                          icon: <Pencil className="h-4 w-4" />,
                          onSelect: () => setEditing(item),
                        },
                        {
                          label: "Delete",
                          icon: <Trash2 className="h-4 w-4" />,
                          destructive: true,
                          onSelect: () => void handleDelete(item.id),
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <DetailModal
          actions={
            viewing && (
              <>
                <Button
                  onClick={() => void handleAdvance(viewing)}
                  type="button"
                  variant="outline"
                >
                  <CalendarDays className="h-4 w-4" />
                  Advance due date
                </Button>
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
          title={viewing?.service ?? ""}
        >
          {viewing && <SubscriptionDetailView item={viewing} />}
        </DetailModal>
      </div>
    </div>
  );
}

type SubscriptionSortColumn =
  "service" | "amount" | "cycle" | "nextDue" | "renew";

function subscriptionSortValue(
  item: SubscriptionEntry,
  column: SubscriptionSortColumn,
): SortValue {
  if (column === "service") return item.service;
  if (column === "amount") return item.amount;
  if (column === "cycle") return subscriptionCycleRank[item.cycle];
  if (column === "nextDue") return Date.parse(item.nextDueDate);
  return item.autoRenew ? "Auto" : "Manual";
}

const subscriptionCycleRank: Record<SubscriptionEntry["cycle"], number> = {
  weekly: 0,
  monthly: 1,
  yearly: 2,
  custom: 3,
};

export function SubscriptionDetailView({ item }: { item: SubscriptionEntry }) {
  return (
    <DetailModalBody>
      <DetailModalHero>
        <p className="text-xs uppercase text-muted-foreground">Subscription</p>
        <div className="mt-1 flex items-start gap-2">
          <CreditCard className="mt-1 h-4 w-4 text-primary" />
          <h2 className="min-w-0 flex-1 text-lg font-semibold">
            {item.service}
          </h2>
        </div>
      </DetailModalHero>
      <DetailFields>
        <DetailField
          label="Amount"
          value={formatCurrencyAmount(item.amount, item.currency)}
        />
        <DetailField label="Cycle" value={formatCycleDetail(item)} />
        <DetailField label="Next due" value={formatDate(item.nextDueDate)} />
        <DetailField
          label="Reminder"
          value={`${item.notifyLeadDays} days before due`}
        />
        <DetailField
          label="Renewal"
          value={item.autoRenew ? "Auto" : "Manual"}
        />
        <DetailField label="Category" value={item.category} />
        <DetailField label="Tags" value={item.tags.join(", ") || "-"} />
        <DetailUrlField label="Billing URL" value={item.url} />
        <DetailField
          label="Updated"
          value={new Date(item.updatedAt).toLocaleString()}
        />
        <DetailFieldSpan label="Notes" value={item.notes || "-"} />
      </DetailFields>
    </DetailModalBody>
  );
}

export function SubscriptionEditView({
  item,
  onSave,
  onCancel,
}: {
  item?: SubscriptionEntry;
  onSave: (item: SubscriptionEntry) => void;
  onCancel: () => void;
}) {
  const { categoryOptions, tagOptions, taxonomy } = useTaxonomySettings();
  const [form, setForm] = useState<SubscriptionFormInput>(() =>
    item ? formFromSubscription(item) : emptySubscriptionForm(taxonomy),
  );
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof SubscriptionFormInput>(
    key: K,
    value: SubscriptionFormInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateSubscriptionInput(form);
    if (validation) {
      setError(validation);
      return;
    }
    const now = new Date().toISOString();
    onSave(
      item
        ? updateSubscriptionEntry(item, form, now)
        : createSubscriptionEntry(form, now),
    );
  }

  return (
    <ItemFormShell
      cancelLabel="Cancel"
      description="Track renewals, due reminders, and billing URLs."
      error={error}
      mode={item ? "edit" : "create"}
      onCancel={onCancel}
      onSubmit={submit}
      title={item ? "Edit subscription" : "New subscription"}
    >
      <label className="space-y-1 text-sm font-medium">
        Service
        <Input
          aria-label="Subscription service"
          onChange={(event) => update("service", event.target.value)}
          value={form.service}
        />
      </label>
      <label className="space-y-1 text-sm font-medium">
        Billing URL
        <div className="relative">
          <ExternalLink className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Subscription billing URL"
            className="pl-9"
            onChange={(event) => update("url", event.target.value)}
            value={form.url}
          />
        </div>
      </label>
      <label className="space-y-1 text-sm font-medium">
        Amount
        <Input
          aria-label="Subscription amount"
          min={0}
          onChange={(event) => update("amount", event.target.value)}
          step="0.01"
          type="number"
          value={form.amount}
        />
      </label>
      <label className="space-y-1 text-sm font-medium">
        Currency
        <CurrencySelect
          aria-label="Subscription currency"
          onChange={(event) => update("currency", event.target.value)}
          value={form.currency}
        />
      </label>
      <label className="space-y-1 text-sm font-medium">
        Cycle
        <Select
          aria-label="Subscription cycle"
          onChange={(event) =>
            update(
              "cycle",
              event.target.value as SubscriptionFormInput["cycle"],
            )
          }
          value={form.cycle}
        >
          {SUBSCRIPTION_CYCLES.map((cycle) => (
            <option key={cycle} value={cycle}>
              {cycle}
            </option>
          ))}
        </Select>
      </label>
      <label className="space-y-1 text-sm font-medium">
        Custom days
        <Input
          aria-label="Subscription custom interval days"
          disabled={form.cycle !== "custom"}
          min={1}
          onChange={(event) => update("customIntervalDays", event.target.value)}
          type="number"
          value={form.customIntervalDays}
        />
      </label>
      <label className="space-y-1 text-sm font-medium">
        Next due
        <DatePicker
          aria-label="Subscription next due date"
          onChange={(nextDueDate) => update("nextDueDate", nextDueDate)}
          placeholder="Pick a due date"
          value={form.nextDueDate}
        />
      </label>
      <label className="space-y-1 text-sm font-medium">
        Reminder lead
        <Input
          aria-label="Subscription reminder lead days"
          min={0}
          onChange={(event) => update("notifyLeadDays", event.target.value)}
          type="number"
          value={form.notifyLeadDays}
        />
      </label>
      <label className="space-y-1 text-sm font-medium">
        Category
        <CategorySelect
          aria-label="Subscription category"
          onChange={(event) => update("category", event.target.value)}
          options={categoryOptions}
          value={form.category}
        />
      </label>
      <label className="col-span-2 space-y-1 text-sm font-medium">
        Tags
        <TagMultiSelect
          aria-label="Subscription tags"
          onChange={(tags) => update("tags", tags)}
          options={tagOptions}
          value={form.tags}
        />
      </label>
      <label className="col-span-2 flex items-center gap-2 text-sm font-medium">
        <Checkbox
          aria-label="Subscription auto renew"
          checked={form.autoRenew}
          onCheckedChange={(checked) => update("autoRenew", checked)}
        />
        Auto renew
      </label>
      <label className="col-span-2 space-y-1 text-sm font-medium">
        Notes
        <textarea
          aria-label="Subscription notes"
          className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) => update("notes", event.target.value)}
          value={form.notes}
        />
      </label>
    </ItemFormShell>
  );
}

function SummaryStrip({
  summary,
}: {
  summary: ReturnType<typeof summarizeSubscriptions>;
}) {
  const rawMonthly = formatTotals(
    summary.rawTotals.map((total) => ({
      currency: total.currency,
      amount: total.monthly,
    })),
  );
  const rawAnnual = formatTotals(
    summary.rawTotals.map((total) => ({
      currency: total.currency,
      amount: total.annual,
    })),
  );
  const converted =
    summary.converted && summary.converted.missingCurrencies.length === 0
      ? `${formatCurrencyAmount(
          summary.converted.monthly,
          summary.converted.currency,
        )} monthly / ${formatCurrencyAmount(
          summary.converted.annual,
          summary.converted.currency,
        )} annual`
      : null;

  return (
    <div className="mt-4 grid gap-3 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)]">
      <SummaryMetric label="Monthly" value={rawMonthly} />
      <SummaryMetric label="Annual" value={rawAnnual} />
      <SummaryMetric label="Converted" value={converted ?? "No FX base"} wide />
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className="min-w-0 border-l border-border pl-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-medium",
          wide ? "break-words whitespace-normal" : "truncate",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function CyclePill({ cycle }: { cycle: SubscriptionEntry["cycle"] }) {
  const label = cycle[0].toUpperCase() + cycle.slice(1);
  return (
    <span className="inline-flex rounded-sm border border-border px-2 py-0.5 text-xs text-muted-foreground">
      {label}
    </span>
  );
}

function formatCycleDetail(item: SubscriptionEntry): string {
  if (item.cycle === "custom" && item.customIntervalDays) {
    return `Every ${item.customIntervalDays} days`;
  }
  return item.cycle;
}

function formatTotals(totals: { currency: string; amount: number }[]): string {
  if (totals.length === 0) return "-";
  return totals
    .map((total) => formatCurrencyAmount(total.amount, total.currency))
    .join(", ");
}
