import { type FormEvent, useMemo, useState } from "react";

import {
  CalendarDays,
  CreditCard,
  ExternalLink,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ListViewProps } from "@/modules/types";
import { useVaultStore } from "@/stores/vault-store";
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
}: ListViewProps<SubscriptionEntry>) {
  const model = useVaultStore((s) => s.model);
  const saveSubscription = useVaultStore((s) => s.saveSubscription);
  const deleteSubscription = useVaultStore((s) => s.deleteSubscription);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<
    SubscriptionEntry | null | undefined
  >();

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
    if (!term) return sorted;
    return sorted.filter((item) =>
      [item.service, item.url, item.currency, item.cycle, item.notes]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [subscriptions, query]);
  const selected =
    subscriptions.find((item) => item.id === selectedId) ?? filtered[0] ?? null;

  async function handleSave(entry: SubscriptionEntry) {
    await saveSubscription(entry);
    setSelectedId(entry.id);
    setEditing(undefined);
  }

  async function handleDelete(id: string) {
    await deleteSubscription(id);
    if (selectedId === id) setSelectedId(null);
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
    setSelectedId(item.id);
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
          <Button onClick={() => setEditing(null)}>
            <Plus className="h-4 w-4" />
            New
          </Button>
        </div>
        <SummaryStrip summary={summary} />
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
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
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
              <div>
                <p className="font-medium text-foreground">
                  No subscriptions found
                </p>
                <p>Add one or adjust the filter.</p>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full table-fixed text-sm">
                <thead className="sticky top-0 bg-background text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="w-4/12 px-4 py-2 font-medium">Service</th>
                    <th className="w-2/12 px-4 py-2 font-medium">Amount</th>
                    <th className="w-2/12 px-4 py-2 font-medium">Cycle</th>
                    <th className="w-2/12 px-4 py-2 font-medium">Next due</th>
                    <th className="w-24 px-4 py-2 font-medium">Renew</th>
                    <th className="w-32 px-4 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr
                      className={
                        selected?.id === item.id
                          ? "border-b border-border bg-accent/60"
                          : "border-b border-border hover:bg-accent/40"
                      }
                      key={item.id}
                    >
                      <td className="truncate px-4 py-3">
                        <button
                          className="max-w-full truncate text-left font-medium"
                          onClick={() => setSelectedId(item.id)}
                          type="button"
                        >
                          {item.service}
                        </button>
                      </td>
                      <td className="truncate px-4 py-3 text-muted-foreground">
                        {formatCurrencyAmount(item.amount, item.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <CyclePill cycle={item.cycle} />
                      </td>
                      <td className="truncate px-4 py-3 text-muted-foreground">
                        {formatDate(item.nextDueDate)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {item.autoRenew ? "Auto" : "Manual"}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            aria-label={`Advance ${item.service}`}
                            onClick={() => void handleAdvance(item)}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <CalendarDays className="h-4 w-4" />
                          </Button>
                          <Button
                            aria-label={`Edit ${item.service}`}
                            onClick={() => setEditing(item)}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            aria-label={`Delete ${item.service}`}
                            onClick={() => void handleDelete(item.id)}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="w-80 border-l border-border">
          {selected ? (
            <SubscriptionDetailView
              item={selected}
              onAdvance={() => void handleAdvance(selected)}
              onEdit={() => setEditing(selected)}
            />
          ) : (
            <div className="p-6 text-sm text-muted-foreground">
              Select a subscription to inspect it.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export function SubscriptionDetailView({
  item,
  onAdvance,
  onEdit,
}: {
  item: SubscriptionEntry;
  onAdvance?: () => void;
  onEdit?: () => void;
}) {
  return (
    <div className="space-y-5 p-6">
      <div>
        <p className="text-xs uppercase text-muted-foreground">Subscription</p>
        <div className="mt-1 flex items-start gap-2">
          <CreditCard className="mt-1 h-4 w-4 text-primary" />
          <h2 className="min-w-0 flex-1 text-lg font-semibold">
            {item.service}
          </h2>
        </div>
      </div>
      <DetailRow
        label="Amount"
        value={formatCurrencyAmount(item.amount, item.currency)}
      />
      <DetailRow label="Cycle" value={formatCycleDetail(item)} />
      <DetailRow label="Next due" value={formatDate(item.nextDueDate)} />
      <DetailRow
        label="Reminder"
        value={`${item.notifyLeadDays} days before due`}
      />
      <DetailRow label="Renewal" value={item.autoRenew ? "Auto" : "Manual"} />
      <DetailRow label="Billing URL" value={item.url || "-"} />
      <DetailRow label="Notes" value={item.notes || "-"} />
      <DetailRow
        label="Updated"
        value={new Date(item.updatedAt).toLocaleString()}
      />
      <div className="flex flex-wrap gap-2">
        {onAdvance && (
          <Button onClick={onAdvance} type="button" variant="secondary">
            <CalendarDays className="h-4 w-4" />
            Advance due
          </Button>
        )}
        {onEdit && (
          <Button onClick={onEdit} type="button" variant="outline">
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        )}
      </div>
    </div>
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
  const [form, setForm] = useState<SubscriptionFormInput>(
    item ? formFromSubscription(item) : emptySubscriptionForm(),
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
    <form className="flex h-full flex-col" onSubmit={submit}>
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">
            {item ? "Edit subscription" : "New subscription"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Track renewals, due reminders, and billing URLs.
          </p>
        </div>
        <Button
          aria-label="Cancel"
          onClick={onCancel}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="grid flex-1 gap-4 overflow-auto p-6 md:grid-cols-2">
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
          <Input
            aria-label="Subscription currency"
            maxLength={8}
            onChange={(event) => update("currency", event.target.value)}
            value={form.currency}
          />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Cycle
          <select
            aria-label="Subscription cycle"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          Custom days
          <Input
            aria-label="Subscription custom interval days"
            disabled={form.cycle !== "custom"}
            min={1}
            onChange={(event) =>
              update("customIntervalDays", event.target.value)
            }
            type="number"
            value={form.customIntervalDays}
          />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Next due
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label="Subscription next due date"
              className="pl-9"
              onChange={(event) => update("nextDueDate", event.target.value)}
              type="date"
              value={form.nextDueDate}
            />
          </div>
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
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            aria-label="Subscription auto renew"
            checked={form.autoRenew}
            className="h-4 w-4 accent-primary"
            onChange={(event) => update("autoRenew", event.target.checked)}
            type="checkbox"
          />
          Auto renew
        </label>
        <label className="space-y-1 text-sm font-medium md:col-span-2">
          Notes
          <textarea
            aria-label="Subscription notes"
            className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => update("notes", event.target.value)}
            value={form.notes}
          />
        </label>
        {error && (
          <p className="text-sm text-destructive md:col-span-2">{error}</p>
        )}
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
    <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
      <SummaryMetric label="Monthly" value={rawMonthly} />
      <SummaryMetric label="Annual" value={rawAnnual} />
      <SummaryMetric label="Converted" value={converted ?? "No FX base"} />
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-l border-border pl-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-medium">{value}</p>
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm">{value}</p>
    </div>
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
