import { type FormEvent, useEffect, useMemo, useState } from "react";

import {
  type LucideIcon,
  Coins,
  CreditCard,
  ExternalLink,
  Eye,
  Link,
  Pencil,
  Plus,
  Search,
  TrendingUp,
  Trash2,
} from "lucide-react";

import { CategorySelect } from "@/components/category-select";
import {
  CategoryFilterSelect,
  categoryFilterOptions,
} from "@/components/category-filter-select";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { DatePicker } from "@/components/date-picker";
import { DetailModal } from "@/components/DetailModal";
import { DueStatusBadge } from "@/components/DueStatusBadge";
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
import { ClearFiltersButton } from "@/components/ClearFiltersButton";
import { InlineSelect } from "@/components/inline-select";
import { ListItemTitle } from "@/components/ListItemTitle";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { TagMultiSelect } from "@/components/tag-multi-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CurrencySelect } from "@/components/currency-select";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  nextSortState,
  stableSortBy,
  type SortState,
  type SortValue,
} from "@/lib/table-sort";
import { isHttpUrl, openExternalUrl } from "@/lib/url";
import { useClearFiltersOnEscape } from "@/hooks/use-clear-filters-on-escape";
import { useTaxonomySettings } from "@/hooks/use-taxonomy-settings";
import { FxRatesView } from "@/modules/finance/FinanceModule";
import type { ListViewProps } from "@/modules/types";
import { t, tp, useT } from "@/i18n";
import { useVaultStore } from "@/stores/vault-store";
import { defaultSettings } from "@/vault/model";
import {
  createSubscriptionEntry,
  emptySubscriptionForm,
  formatCurrencyAmount,
  formatDate,
  formFromSubscription,
  nextAutoInvoiceDate,
  resolveSubscription,
  sortSubscriptions,
  subscriptionEntries,
  subscriptionNextDateLabel,
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
  const { t, tp } = useT();
  const model = useVaultStore((s) => s.model);
  const saveSubscription = useVaultStore((s) => s.saveSubscription);
  const deleteSubscription = useVaultStore((s) => s.deleteSubscription);
  const { categoryOptions } = useTaxonomySettings();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [viewing, setViewing] = useState<SubscriptionEntry | null>(null);
  const [editing, setEditing] = useState<
    SubscriptionEntry | null | undefined
  >();
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [showFx, setShowFx] = useState(false);
  const [sortState, setSortState] =
    useState<SortState<SubscriptionSortColumn> | null>(null);

  const subscriptions = useMemo(
    () => subscriptionEntries(items).map((item) => resolveSubscription(item)),
    [items],
  );

  useEffect(() => {
    const now = new Date();
    for (const item of subscriptionEntries(items)) {
      const nextDueDate = nextAutoInvoiceDate(item, now);
      if (nextDueDate === item.nextDueDate) continue;
      void saveSubscription({
        ...item,
        nextDueDate,
        updatedAt: now.toISOString(),
      });
    }
  }, [items, saveSubscription]);
  const filterCategories = useMemo(
    () =>
      categoryFilterOptions(
        categoryOptions,
        subscriptions.map((item) => item.category),
      ),
    [categoryOptions, subscriptions],
  );
  const filtersActive = Boolean(query.trim()) || Boolean(categoryFilter);
  useClearFiltersOnEscape(filtersActive, () => {
    setQuery("");
    setCategoryFilter("");
  });
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
    const byCategory = categoryFilter
      ? sorted.filter((item) => item.category === categoryFilter)
      : sorted;
    const visible = term
      ? byCategory.filter((item) =>
          [
            item.service,
            item.url,
            item.currency,
            item.cycle,
            item.notes,
            item.category,
          ]
            .join(" ")
            .toLowerCase()
            .includes(term),
        )
      : byCategory;
    return sortState
      ? stableSortBy(visible, sortState, subscriptionSortValue)
      : visible;
  }, [subscriptions, query, categoryFilter, sortState]);
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

  async function handleCycleChange(
    item: SubscriptionEntry,
    cycle: SubscriptionEntry["cycle"],
  ) {
    const now = new Date();
    const updated = resolveSubscription(
      {
        ...item,
        cycle,
        customIntervalDays:
          cycle === "custom" ? (item.customIntervalDays ?? 30) : null,
        updatedAt: now.toISOString(),
      },
      now,
    );
    await saveSubscription(updated);
    setViewing((current) => (current?.id === item.id ? updated : current));
  }

  async function handleRenewChange(
    item: SubscriptionEntry,
    autoRenew: boolean,
  ) {
    const now = new Date();
    const updated = resolveSubscription(
      {
        ...item,
        autoRenew,
        updatedAt: now.toISOString(),
      },
      now,
    );
    await saveSubscription(updated);
    setViewing((current) => (current?.id === item.id ? updated : current));
  }

  async function handleDelete(id: string) {
    await deleteSubscription(id);
    if (viewing?.id === id) setViewing(null);
    setPendingDelete(null);
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
  if (showFx) {
    return <FxRatesView onClose={() => setShowFx(false)} />;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold">
              {t("module.subscriptions")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {tp("subscriptions.trackedCount", subscriptions.length)}
            </p>
          </div>
          <Button
            onClick={() => setShowFx(true)}
            type="button"
            variant="outline"
          >
            <Coins className="h-4 w-4" />
            {t("finance.fxRates")}
          </Button>
          <Button onClick={startCreate}>
            <Plus className="h-4 w-4" />
            {t("common.new")}
          </Button>
        </div>
        <SummaryStrip summary={summary} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <CategoryFilterSelect
            onChange={setCategoryFilter}
            options={filterCategories}
            value={categoryFilter}
          />
          <label className="relative block min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label={t("subscriptions.filter")}
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("subscriptions.filter")}
              value={query}
            />
          </label>
          {filtersActive ? (
            <ClearFiltersButton
              onClear={() => {
                setQuery("");
                setCategoryFilter("");
              }}
            />
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
              title={t("subscriptions.emptyTitle")}
              description={t("subscriptions.emptyBody")}
              action={
                <Button onClick={startCreate}>
                  <Plus className="h-4 w-4" />
                  {t("subscriptions.new")}
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
                  className="w-[16%] px-4"
                  column="service"
                  label={t("subscriptions.service")}
                  onSort={handleSort}
                  sort={sortState}
                />
                <SortableTableHead
                  className="w-[14%] px-4"
                  column="amount"
                  label={t("field.amount")}
                  onSort={handleSort}
                  sort={sortState}
                />
                <SortableTableHead
                  className="w-[12%] px-4"
                  column="cycle"
                  label={t("subscriptions.cycle")}
                  onSort={handleSort}
                  sort={sortState}
                />
                <SortableTableHead
                  className="w-[22%] px-4"
                  column="nextDue"
                  label={t("subscriptions.nextDate")}
                  onSort={handleSort}
                  sort={sortState}
                />
                <SortableTableHead
                  className="w-[10%] px-4"
                  column="renew"
                  label={t("subscriptions.renew")}
                  onSort={handleSort}
                  sort={sortState}
                />
                <TableHead className="w-12 px-2 text-right" scope="col">
                  <span className="sr-only">Billing URL</span>
                </TableHead>
                <ActionsTableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item, index) => (
                <TableRow
                  className="border-b border-border hover:bg-accent/40"
                  key={item.id}
                >
                  <IndexTableCell index={index + 1} />
                  <TableCell className="truncate px-4 py-3">
                    <ListItemTitle
                      className="truncate"
                      onOpen={() => setViewing(item)}
                    >
                      {item.service}
                    </ListItemTitle>
                  </TableCell>
                  <TableCell className="truncate px-4 py-3 text-muted-foreground">
                    {formatCurrencyAmount(item.amount, item.currency)}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <InlineSelect
                      aria-label={t("subscriptions.cycleFor", {
                        name: item.service,
                      })}
                      display={<CyclePill cycle={item.cycle} />}
                      onChange={(cycle) =>
                        void handleCycleChange(
                          item,
                          cycle as SubscriptionEntry["cycle"],
                        )
                      }
                      options={SUBSCRIPTION_CYCLES.map((cycle) => ({
                        value: cycle,
                        label: t(`subscriptions.cycle.${cycle}`),
                      }))}
                      value={item.cycle}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-4 py-3">
                    <DueStatusBadge
                      dueAt={item.nextDueDate}
                      vocabulary={item.autoRenew ? "invoice" : "due"}
                    />
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    <InlineSelect
                      aria-label={t("subscriptions.renewalFor", {
                        name: item.service,
                      })}
                      className="text-muted-foreground"
                      display={t(
                        item.autoRenew
                          ? "subscriptions.auto"
                          : "subscriptions.manual",
                      )}
                      onChange={(value) =>
                        void handleRenewChange(item, value === "auto")
                      }
                      options={[
                        { value: "auto", label: t("subscriptions.auto") },
                        { value: "manual", label: t("subscriptions.manual") },
                      ]}
                      value={item.autoRenew ? "auto" : "manual"}
                    />
                  </TableCell>
                  <TableCell className="px-2 py-2">
                    <div className="flex justify-end">
                      {isHttpUrl(item.url) ? (
                        <Button
                          aria-label={t("subscriptions.openBillingFor", {
                            name: item.service,
                          })}
                          onClick={() => void openExternalUrl(item.url)}
                          size="icon"
                          title={item.url}
                          type="button"
                          variant="ghost"
                        >
                          <Link className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="px-2 py-2">
                    <RowActionsMenu
                      label={t("common.actionsFor", { name: item.service })}
                      actions={[
                        {
                          label: t("common.view"),
                          icon: <Eye className="h-4 w-4" />,
                          onSelect: () => setViewing(item),
                        },
                        {
                          label: t("common.edit"),
                          icon: <Pencil className="h-4 w-4" />,
                          onSelect: () => setEditing(item),
                        },
                        {
                          label: t("common.delete"),
                          icon: <Trash2 className="h-4 w-4" />,
                          destructive: true,
                          onSelect: () =>
                            setPendingDelete({
                              id: item.id,
                              name: item.service,
                            }),
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
                  onClick={() =>
                    setPendingDelete({
                      id: viewing.id,
                      name: viewing.service,
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
          title={viewing?.service ?? ""}
        >
          {viewing && <SubscriptionDetailView item={viewing} />}
        </DetailModal>

        <ConfirmDeleteDialog
          itemName={pendingDelete?.name ?? ""}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            if (pendingDelete) void handleDelete(pendingDelete.id);
          }}
          open={pendingDelete !== null}
        />
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
  const { t, tp, locale } = useT();
  const resolved = resolveSubscription(item);
  return (
    <DetailModalBody>
      <DetailModalHero>
        <p className="text-xs uppercase text-muted-foreground">
          {t("subscriptions.subscription")}
        </p>
        <div className="mt-1 flex items-start gap-2">
          <CreditCard className="mt-1 h-4 w-4 text-primary" />
          <h2 className="min-w-0 flex-1 text-lg font-semibold">
            {resolved.service}
          </h2>
        </div>
      </DetailModalHero>
      <DetailFields>
        <DetailField
          label={t("field.amount")}
          value={formatCurrencyAmount(resolved.amount, resolved.currency)}
        />
        <DetailField
          label={t("subscriptions.cycle")}
          value={formatCycleDetail(resolved)}
        />
        <DetailField label={subscriptionNextDateLabel(resolved.autoRenew)}>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span>{formatDate(resolved.nextDueDate)}</span>
            <DueStatusBadge
              dueAt={resolved.nextDueDate}
              vocabulary={resolved.autoRenew ? "invoice" : "due"}
            />
          </div>
        </DetailField>
        <DetailField
          label={t("todos.reminder")}
          value={tp(
            resolved.autoRenew
              ? "subscriptions.daysBeforeInvoice"
              : "subscriptions.daysBeforeDue",
            resolved.notifyLeadDays,
          )}
        />
        <DetailField
          label={t("subscriptions.renewal")}
          value={t(
            resolved.autoRenew ? "subscriptions.auto" : "subscriptions.manual",
          )}
        />
        <DetailField label={t("field.category")} value={resolved.category} />
        <DetailField
          label={t("field.tags")}
          value={resolved.tags.join(", ") || "-"}
        />
        <DetailUrlField
          label={t("subscriptions.billingUrl")}
          value={resolved.url}
        />
        <DetailField
          label={t("field.updated")}
          value={new Date(resolved.updatedAt).toLocaleString(locale)}
        />
        <DetailFieldSpan
          label={t("field.notes")}
          value={resolved.notes || "-"}
        />
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
  const { t } = useT();
  const { categoryOptions, tagOptions, taxonomy } = useTaxonomySettings();
  const [form, setForm] = useState<SubscriptionFormInput>(() =>
    item
      ? formFromSubscription(resolveSubscription(item))
      : emptySubscriptionForm(taxonomy),
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
      cancelLabel={t("common.cancel")}
      description={t("subscriptions.formHint")}
      error={error}
      mode={item ? "edit" : "create"}
      onCancel={onCancel}
      onSubmit={submit}
      title={t(item ? "subscriptions.edit" : "subscriptions.new")}
    >
      <label className="space-y-1 text-sm font-medium">
        {t("subscriptions.service")}
        <Input
          aria-label={t("subscriptions.serviceLabel")}
          onChange={(event) => update("service", event.target.value)}
          value={form.service}
        />
      </label>
      <label className="space-y-1 text-sm font-medium">
        {t("subscriptions.billingUrl")}
        <div className="relative">
          <ExternalLink className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label={t("subscriptions.billingUrlLabel")}
            className="pl-9"
            onChange={(event) => update("url", event.target.value)}
            value={form.url}
          />
        </div>
      </label>
      <label className="space-y-1 text-sm font-medium">
        {t("field.amount")}
        <Input
          aria-label={t("subscriptions.amountLabel")}
          min={0}
          onChange={(event) => update("amount", event.target.value)}
          step="0.01"
          type="number"
          value={form.amount}
        />
      </label>
      <label className="space-y-1 text-sm font-medium">
        {t("field.currency")}
        <CurrencySelect
          aria-label={t("subscriptions.currencyLabel")}
          onChange={(event) => update("currency", event.target.value)}
          value={form.currency}
        />
      </label>
      <label className="space-y-1 text-sm font-medium">
        {t("subscriptions.cycle")}
        <Select
          aria-label={t("subscriptions.cycleLabel")}
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
              {t(`subscriptions.cycle.${cycle}`)}
            </option>
          ))}
        </Select>
      </label>
      <label className="space-y-1 text-sm font-medium">
        {t("subscriptions.customDays")}
        <Input
          aria-label={t("subscriptions.customDaysLabel")}
          disabled={form.cycle !== "custom"}
          min={1}
          onChange={(event) => update("customIntervalDays", event.target.value)}
          type="number"
          value={form.customIntervalDays}
        />
      </label>
      <label className="col-span-2 flex items-center gap-2 text-sm font-medium">
        <Checkbox
          aria-label={t("subscriptions.autoRenewLabel")}
          checked={form.autoRenew}
          onCheckedChange={(checked) => update("autoRenew", checked)}
        />
        {t("subscriptions.autoRenew")}
      </label>
      <label className="space-y-1 text-sm font-medium">
        {subscriptionNextDateLabel(form.autoRenew)}
        <DatePicker
          aria-label={t(
            form.autoRenew
              ? "subscriptions.nextInvoiceDateLabel"
              : "subscriptions.dueDateLabel",
          )}
          onChange={(nextDueDate) => update("nextDueDate", nextDueDate)}
          placeholder={t(
            form.autoRenew
              ? "subscriptions.pickInvoiceDate"
              : "subscriptions.pickDueDate",
          )}
          value={form.nextDueDate}
        />
      </label>
      <label className="space-y-1 text-sm font-medium">
        {t("todos.reminderLead")}
        <Input
          aria-label={t("subscriptions.reminderLeadLabel")}
          min={0}
          onChange={(event) => update("notifyLeadDays", event.target.value)}
          type="number"
          value={form.notifyLeadDays}
        />
      </label>
      <label className="space-y-1 text-sm font-medium">
        {t("field.category")}
        <CategorySelect
          aria-label={t("subscriptions.categoryLabel")}
          onChange={(event) => update("category", event.target.value)}
          options={categoryOptions}
          value={form.category}
        />
      </label>
      <label className="col-span-2 space-y-1 text-sm font-medium">
        {t("field.tags")}
        <TagMultiSelect
          aria-label={t("subscriptions.tagsLabel")}
          onChange={(tags) => update("tags", tags)}
          options={tagOptions}
          value={form.tags}
        />
      </label>
      <label className="col-span-2 space-y-1 text-sm font-medium">
        {t("field.notes")}
        <textarea
          aria-label={t("subscriptions.notesLabel")}
          className="min-h-24 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  const { t } = useT();
  const totals = summary.rawTotals.map((total) => ({
    currency: total.currency,
    monthly: formatCurrencyAmount(total.monthly, total.currency),
    yearly: formatCurrencyAmount(total.annual, total.currency),
  }));
  const source = summary.converted;
  // A single row already in the base currency is its own total.
  const showTotal =
    source !== null &&
    (summary.rawTotals.length > 1 ||
      summary.rawTotals[0]?.currency !== source.currency);
  const missingHint =
    source && source.missingCurrencies.length > 0
      ? t("subscriptions.setFxFor", {
          currencies: source.missingCurrencies.join(", "),
        })
      : null;
  const converted =
    source && showTotal
      ? {
          monthly: {
            value: formatCurrencyAmount(source.monthly, source.currency),
            missingHint,
          },
          yearly: {
            value: formatCurrencyAmount(source.annual, source.currency),
            missingHint,
          },
        }
      : null;
  const periods = [
    {
      label: t("subscriptions.monthly"),
      icon: CreditCard,
      tone: "blue" as const,
      totals: totals.map(({ currency, monthly }) => ({
        currency,
        value: monthly,
      })),
      convertedTotal: converted?.monthly ?? null,
    },
    {
      label: t("subscriptions.yearly"),
      icon: TrendingUp,
      tone: "emerald" as const,
      totals: totals.map(({ currency, yearly }) => ({
        currency,
        value: yearly,
      })),
      convertedTotal: converted?.yearly ?? null,
    },
  ];

  return (
    <div
      aria-label={t("subscriptions.spendSummary")}
      className="mt-3 grid gap-4 md:grid-cols-2"
    >
      {periods.map((period) => (
        <SummaryPeriodCard key={period.label} {...period} />
      ))}
    </div>
  );
}

type SummaryTone = "blue" | "emerald";

const summaryToneClasses: Record<SummaryTone, { card: string; icon: string }> =
  {
    blue: {
      card: "border-sky-200/80 bg-sky-50/80 dark:border-sky-400/20 dark:bg-sky-400/10",
      icon: "bg-sky-500/10 text-sky-700 dark:bg-sky-300/15 dark:text-sky-200",
    },
    emerald: {
      card: "border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-400/20 dark:bg-emerald-400/10",
      icon: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-300/15 dark:text-emerald-200",
    },
  };

function SummaryPeriodCard({
  label,
  icon: Icon,
  tone,
  totals,
  convertedTotal,
}: {
  label: string;
  icon: LucideIcon;
  tone: SummaryTone;
  totals: { currency: string; value: string }[];
  convertedTotal: { value: string; missingHint: string | null } | null;
}) {
  const { t } = useT();
  const classes = summaryToneClasses[tone];

  return (
    <section
      aria-label={t("subscriptions.totalsFor", { period: label })}
      className={`flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2 shadow-sm ${classes.card}`}
    >
      <div className="flex shrink-0 items-center gap-2">
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-md ${classes.icon}`}
        >
          <Icon aria-hidden="true" className="h-4 w-4" />
        </div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
      </div>
      <div className="min-w-0 flex-1 text-right">
        {totals.length === 0 ? (
          <p className="text-sm font-semibold text-foreground">-</p>
        ) : (
          totals.map((total) => (
            <p
              className="truncate text-sm font-semibold text-foreground"
              key={total.currency}
            >
              {total.value}
            </p>
          ))
        )}
        {convertedTotal ? (
          <div className="mt-1 border-t border-border/60 pt-1">
            {convertedTotal.missingHint ? (
              <p className="truncate text-xs text-muted-foreground">
                {convertedTotal.missingHint}
              </p>
            ) : (
              <p className="truncate text-sm font-semibold text-foreground">
                {t("subscriptions.total", { value: convertedTotal.value })}
              </p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CyclePill({ cycle }: { cycle: SubscriptionEntry["cycle"] }) {
  const { t } = useT();
  const label = t(`subscriptions.cycle.${cycle}`);
  return (
    <span className="inline-flex rounded-sm border border-border px-2 py-0.5 text-xs text-muted-foreground">
      {label}
    </span>
  );
}

function formatCycleDetail(item: SubscriptionEntry): string {
  if (item.cycle === "custom" && item.customIntervalDays) {
    return tp("subscriptions.everyDays", item.customIntervalDays);
  }
  return t(`subscriptions.cycle.${item.cycle}`);
}
