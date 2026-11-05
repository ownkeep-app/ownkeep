import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  ArrowLeft,
  CalendarDays,
  ChartGantt,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  TrendingUp,
  Upload,
} from "lucide-react";

import { ClearFiltersButton } from "@/components/ClearFiltersButton";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { EmptyState } from "@/components/EmptyState";
import { ItemFormShell } from "@/components/ItemFormShell";
import { DragHandle, SORTABLE_ITEM_CLASS } from "@/components/DragHandle";
import { ListItemTitle } from "@/components/ListItemTitle";
import { MarkdownEditor, MarkdownPreview } from "@/components/MarkdownEditor";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { dateInputToIso, formatDate } from "@/lib/date";
import { useClearFiltersOnEscape } from "@/hooks/use-clear-filters-on-escape";
import { useDragSort } from "@/hooks/use-drag-sort";
import { moveItem } from "@/lib/reorder";
import { toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { ListViewProps } from "@/modules/types";
import { t, tp, useT } from "@/i18n";
import { useVaultStore } from "@/stores/vault-store";
import { hasManualOrder } from "@/vault/model";
import { CalendarView } from "./CalendarView";
import { CsvImportDialog } from "./CsvImportDialog";
import { DayEditor } from "./DayEditor";
import { DayView } from "./DayView";
import { TagIcon, TagIconPicker } from "./icons";
import { planCsvImport, type ImportPlan } from "./import";
import {
  createTag,
  createTrackedEvent,
  dayFor,
  emptyEventForm,
  eventDateRange,
  formFromEvent,
  removeDay,
  sortEvents,
  statusLabel,
  tagTypeLabel,
  trackedEvents,
  updateTrackedEvent,
  upsertDay,
  validateEventInput,
} from "./logic";
import { TimelineView } from "./TimelineView";
import { TrendingView } from "./TrendingView";
import {
  EVENTS_MODULE_ID,
  EVENT_STATUSES,
  TAG_TYPES,
  type EventFormInput,
  type EventStatus,
  type EventTag,
  type TrackedEvent,
} from "./types";

type EventViewMode = "calendar" | "timeline" | "trending";

const STATUS_BADGE_CLASSES: Record<EventStatus, string> = {
  open: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300",
  paused:
    "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
  closed: "bg-muted text-muted-foreground",
};

function StatusBadge({ status }: { status: EventStatus }) {
  useT(); // re-render the label on a language switch
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_BADGE_CLASSES[status],
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

function dateRangeLabel(event: TrackedEvent): string {
  const range = eventDateRange(event);
  if (!range) return t("events.nothingTracked");
  const first = formatDate(dateInputToIso(range.first));
  const last = formatDate(dateInputToIso(range.last));
  const days = tp("events.dayCount", event.days.length);
  return first === last ? `${first} · ${days}` : `${first} – ${last} · ${days}`;
}

export function EventsListView({
  items,
  focusItemId,
  onFocusItemHandled,
}: ListViewProps<TrackedEvent>) {
  const { t, tp } = useT();
  const saveEvent = useVaultStore((s) => s.saveEvent);
  const deleteEvent = useVaultStore((s) => s.deleteEvent);
  const reorderItems = useVaultStore((s) => s.reorderItems);
  const manualOrder = useVaultStore(
    (s) =>
      s.model !== null && hasManualOrder(s.model.settings, EVENTS_MODULE_ID),
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<EventStatus | "">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TrackedEvent | null | undefined>();
  const [pendingDelete, setPendingDelete] = useState<TrackedEvent | null>(null);

  const events = useMemo(() => {
    const stored = trackedEvents(items);
    return manualOrder ? stored : sortEvents(stored);
  }, [items, manualOrder]);
  const selected = events.find((event) => event.id === selectedId) ?? null;
  const filtersActive = Boolean(query.trim()) || Boolean(statusFilter);
  useClearFiltersOnEscape(filtersActive && !selected, () => {
    setQuery("");
    setStatusFilter("");
  });

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return events.filter(
      (event) =>
        (!statusFilter || event.status === statusFilter) &&
        (!term ||
          [event.title, event.description, ...event.tags.map((tag) => tag.name)]
            .join(" ")
            .toLowerCase()
            .includes(term)),
    );
  }, [events, query, statusFilter]);

  const sort = useDragSort((activeId, overId) => {
    reorderItems(EVENTS_MODULE_ID, moveItem(events, activeId, overId)).catch(
      () => toastError(t("common.reorderFailed")),
    );
  });

  useEffect(() => {
    if (!focusItemId) return;
    if (!events.some((event) => event.id === focusItemId)) return;
    setSelectedId(focusItemId);
    onFocusItemHandled?.();
  }, [focusItemId, events, onFocusItemHandled]);

  // The store shows a save immediately and rolls back if the encrypted write fails; surface that.
  async function persist(entry: TrackedEvent) {
    try {
      await saveEvent(entry);
    } catch {
      toastError(t("events.saveFailed"));
    }
  }

  function handleSave(entry: TrackedEvent) {
    setEditing(undefined);
    setSelectedId(entry.id);
    void persist(entry);
  }

  async function handleDelete(id: string) {
    await deleteEvent(id);
    if (selectedId === id) setSelectedId(null);
    setPendingDelete(null);
  }

  const deleteDialog = (
    <ConfirmDeleteDialog
      itemName={pendingDelete?.title ?? ""}
      onCancel={() => setPendingDelete(null)}
      onConfirm={() => {
        if (pendingDelete) void handleDelete(pendingDelete.id);
      }}
      open={pendingDelete !== null}
    />
  );

  if (editing !== undefined) {
    return (
      <EventEditView
        item={editing ?? undefined}
        onCancel={() => setEditing(undefined)}
        onSave={handleSave}
      />
    );
  }

  if (selected) {
    return (
      <>
        <EventPane
          event={selected}
          onBack={() => setSelectedId(null)}
          onDelete={() => setPendingDelete(selected)}
          onEdit={() => setEditing(selected)}
          onSave={(entry) => void persist(entry)}
        />
        {deleteDialog}
      </>
    );
  }

  const startCreate = () => setEditing(null);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">{t("module.events")}</h1>
          <p className="text-sm text-muted-foreground">
            {tp("events.trackedCount", events.length)}
          </p>
        </div>
        <Button onClick={startCreate}>
          <Plus className="h-4 w-4" />
          {t("common.new")}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <Select
            aria-label={t("events.filterByStatus")}
            className="sm:w-40"
            onChange={(event) =>
              setStatusFilter(event.target.value as EventStatus | "")
            }
            value={statusFilter}
          >
            <option value="">{t("events.allStatuses")}</option>
            {EVENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </Select>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("events.filter")}
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("events.filter")}
              value={query}
            />
          </div>
          {filtersActive ? (
            <ClearFiltersButton
              onClear={() => {
                setQuery("");
                setStatusFilter("");
              }}
            />
          ) : null}
        </div>

        {filtered.length === 0 ? (
          filtersActive ? (
            <EmptyState
              title={t("common.noMatches")}
              description={t("events.noMatchesBody")}
            />
          ) : (
            <EmptyState
              title={t("events.emptyTitle")}
              description={t("events.emptyBody")}
              action={
                <Button onClick={startCreate}>
                  <Plus className="h-4 w-4" />
                  {t("events.new")}
                </Button>
              }
            />
          )
        ) : (
          <ul className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
            {filtered.map((event) => (
              <li
                className={cn(
                  "rounded-md border border-border bg-card p-3 hover:bg-accent/40",
                  SORTABLE_ITEM_CLASS,
                )}
                key={event.id}
                {...sort.itemProps(event.id)}
              >
                <div className="flex items-center gap-2">
                  <DragHandle
                    className="-ml-1"
                    itemName={event.title}
                    {...sort.handleProps(
                      event.id,
                      filtered.map((item) => item.id),
                    )}
                  />
                  <ListItemTitle
                    className="min-w-0 flex-1 truncate text-xl leading-7"
                    onOpen={() => setSelectedId(event.id)}
                  >
                    {event.title}
                  </ListItemTitle>
                  <StatusBadge status={event.status} />
                  <div className="-mr-1.5 shrink-0 [&_button]:h-7 [&_button]:w-7">
                    <RowActionsMenu
                      label={t("common.actionsFor", { name: event.title })}
                      actions={[
                        {
                          label: t("events.open"),
                          icon: <CalendarDays className="h-4 w-4" />,
                          onSelect: () => setSelectedId(event.id),
                        },
                        {
                          label: t("common.edit"),
                          icon: <Pencil className="h-4 w-4" />,
                          onSelect: () => setEditing(event),
                        },
                        {
                          label: t("common.delete"),
                          icon: <Trash2 className="h-4 w-4" />,
                          destructive: true,
                          onSelect: () => setPendingDelete(event),
                        },
                      ]}
                    />
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {dateRangeLabel(event)}
                </p>
                {event.tags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {event.tags.map((tag) => (
                      <span
                        className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                        key={tag.id}
                      >
                        <TagIcon icon={tag.icon} />
                        {tag.name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      {deleteDialog}
    </div>
  );
}

function EventPane({
  event,
  onBack,
  onEdit,
  onDelete,
  onSave,
}: {
  event: TrackedEvent;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSave: (event: TrackedEvent) => void;
}) {
  const { t } = useT();
  const [mode, setMode] = useState<EventViewMode>("calendar");
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [viewingDate, setViewingDate] = useState<string | null>(null);

  // A recorded day opens read-only first; an empty day has nothing to view, so it opens editing.
  function openDay(date: string) {
    if (dayFor(event, date)) setViewingDate(date);
    else setEditingDate(date);
  }
  const [showDescription, setShowDescription] = useState(false);
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  async function previewImport(file: File | undefined) {
    if (!file) return;
    setImportPlan(
      planCsvImport(event, await file.text(), new Date().toISOString()),
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Button
          aria-label={t("events.back")}
          onClick={onBack}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{event.title}</h1>
          <p className="text-xs text-muted-foreground">
            {dateRangeLabel(event)}
          </p>
        </div>
        <Select
          aria-label={t("events.statusLabel")}
          className="w-28"
          onChange={(change) =>
            onSave({
              ...event,
              status: change.target.value as EventStatus,
              updatedAt: new Date().toISOString(),
            })
          }
          value={event.status}
        >
          {EVENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {statusLabel(status)}
            </option>
          ))}
        </Select>
        <ButtonGroup<EventViewMode>
          aria-label={t("events.viewLabel")}
          onValueChange={setMode}
          options={[
            {
              value: "calendar",
              label: t("events.view.calendar"),
              icon: <CalendarDays className="h-4 w-4" />,
            },
            {
              value: "timeline",
              label: t("events.view.timeline"),
              icon: <ChartGantt className="h-4 w-4" />,
            },
            {
              value: "trending",
              label: t("events.view.trending"),
              icon: <TrendingUp className="h-4 w-4" />,
            },
          ]}
          role="tablist"
          value={mode}
        />
        <RowActionsMenu
          label={t("common.actionsFor", { name: event.title })}
          actions={[
            {
              label: t("common.edit"),
              icon: <Pencil className="h-4 w-4" />,
              onSelect: onEdit,
            },
            {
              label: t("events.importCsv"),
              icon: <Upload className="h-4 w-4" />,
              onSelect: () => importInputRef.current?.click(),
            },
            {
              label: t("common.delete"),
              icon: <Trash2 className="h-4 w-4" />,
              destructive: true,
              onSelect: onDelete,
            },
          ]}
        />
        <input
          accept=".csv,text/csv"
          className="sr-only"
          data-testid="csv-import-input"
          onChange={(change) => {
            void previewImport(change.target.files?.[0]);
            change.target.value = "";
          }}
          ref={importInputRef}
          tabIndex={-1}
          type="file"
        />
      </header>

      {event.description.trim() ? (
        <div className="border-b border-border px-6 py-2">
          <button
            aria-expanded={showDescription}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setShowDescription((current) => !current)}
            type="button"
          >
            {showDescription ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            {t("field.description")}
          </button>
          {showDescription ? (
            <MarkdownPreview
              className="max-h-56 overflow-auto pb-2 pt-1"
              content={event.description}
            />
          ) : null}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {mode === "calendar" ? (
          <CalendarView event={event} onOpenDay={openDay} />
        ) : mode === "timeline" ? (
          <TimelineView event={event} onOpenDay={openDay} />
        ) : (
          <TrendingView event={event} onOpenDay={openDay} />
        )}
      </div>

      {editingDate ? (
        // Overlay rather than replace the pane so the calendar month and timeline pan/zoom
        // survive opening and closing a day.
        <div className="absolute inset-0 z-20">
          <DayEditor
            date={editingDate}
            event={event}
            onCancel={() => setEditingDate(null)}
            onDelete={() => {
              onSave(removeDay(event, editingDate, new Date().toISOString()));
              setEditingDate(null);
            }}
            onSave={(day) => {
              onSave(upsertDay(event, day, new Date().toISOString()));
              setEditingDate(null);
            }}
          />
        </div>
      ) : null}

      <DayView
        date={viewingDate}
        event={event}
        onClose={() => setViewingDate(null)}
        onDelete={() => {
          if (viewingDate)
            onSave(removeDay(event, viewingDate, new Date().toISOString()));
          setViewingDate(null);
        }}
        onEdit={() => {
          setEditingDate(viewingDate);
          setViewingDate(null);
        }}
      />

      <CsvImportDialog
        onCancel={() => setImportPlan(null)}
        onConfirm={(plan) => {
          onSave(plan.event);
          setImportPlan(null);
        }}
        plan={importPlan}
      />
    </div>
  );
}

export function EventDetailView({ item }: { item: TrackedEvent }) {
  return (
    <div className="space-y-3 p-6">
      <div className="flex items-center gap-2">
        <StatusBadge status={item.status} />
        <span className="text-xs text-muted-foreground">
          {dateRangeLabel(item)}
        </span>
      </div>
      {item.description.trim() ? (
        <MarkdownPreview content={item.description} />
      ) : (
        <p className="text-sm text-muted-foreground">No description.</p>
      )}
    </div>
  );
}

export function EventEditView({
  item,
  onSave,
  onCancel,
}: {
  item?: TrackedEvent;
  onSave: (item: TrackedEvent) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [form, setForm] = useState<EventFormInput>(() =>
    item ? formFromEvent(item) : emptyEventForm(),
  );
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof EventFormInput>(
    key: K,
    value: EventFormInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateTag(id: string, patch: Partial<EventTag>) {
    update(
      "tags",
      form.tags.map((tag) => (tag.id === id ? { ...tag, ...patch } : tag)),
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateEventInput(form);
    if (validation) {
      setError(validation);
      return;
    }
    const now = new Date().toISOString();
    onSave(
      item
        ? updateTrackedEvent(item, form, now)
        : createTrackedEvent(form, now),
    );
  }

  return (
    <ItemFormShell
      cancelLabel={t("common.cancel")}
      description={t("events.formHint")}
      error={error}
      mode={item ? "edit" : "create"}
      onCancel={onCancel}
      onSubmit={submit}
      title={t(item ? "events.edit" : "events.new")}
    >
      <div className="col-span-2 grid grid-cols-4 gap-4">
        <label className="col-span-3 space-y-1 text-sm font-medium">
          {t("field.title")}
          <Input
            aria-label={t("events.titleLabel")}
            onChange={(event) => update("title", event.target.value)}
            placeholder={t("events.titlePlaceholder")}
            value={form.title}
          />
        </label>
        <label className="col-span-1 space-y-1 text-sm font-medium">
          {t("field.status")}
          <Select
            aria-label={t("field.status")}
            onChange={(event) =>
              update("status", event.target.value as EventStatus)
            }
            value={form.status}
          >
            {EVENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <section className="col-span-2 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">{t("field.tags")}</h2>
          <Button
            onClick={() => update("tags", [...form.tags, createTag()])}
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus className="h-4 w-4" />
            {t("events.addTag")}
          </Button>
        </div>
        {form.tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("events.tagsExample")}
          </p>
        ) : (
          <ul className="space-y-2">
            {form.tags.map((tag, index) => (
              <TagEditorRow
                key={tag.id}
                onChange={(patch) => updateTag(tag.id, patch)}
                onRemove={() =>
                  update(
                    "tags",
                    form.tags.filter((entry) => entry.id !== tag.id),
                  )
                }
                position={index + 1}
                tag={tag}
              />
            ))}
          </ul>
        )}
        {item && item.tags.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("events.tagRemoveWarning")}
          </p>
        ) : null}
      </section>

      <div className="col-span-2 space-y-1 text-sm font-medium">
        {t("field.description")}
        <MarkdownEditor
          ariaLabel={t("events.descriptionLabel")}
          minHeightClass="min-h-40"
          onChange={(value) => update("description", value)}
          value={form.description}
        />
      </div>
    </ItemFormShell>
  );
}

function TagEditorRow({
  tag,
  position,
  onChange,
  onRemove,
}: {
  tag: EventTag;
  position: number;
  onChange: (patch: Partial<EventTag>) => void;
  onRemove: () => void;
}) {
  const { t } = useT();
  return (
    <li className="flex items-center gap-2">
      <TagIconPicker
        label={t("events.tagIcon", { n: position })}
        onChange={(icon) => onChange({ icon })}
        value={tag.icon}
      />
      <Input
        aria-label={t("events.tagName", { n: position })}
        className="flex-1"
        onChange={(event) => onChange({ name: event.target.value })}
        placeholder={t("field.name")}
        value={tag.name}
      />
      <Select
        aria-label={t("events.tagTypeLabel", { n: position })}
        className="w-32"
        onChange={(event) =>
          onChange({ type: event.target.value as EventTag["type"] })
        }
        value={tag.type}
      >
        {TAG_TYPES.map((type) => (
          <option key={type} value={type}>
            {tagTypeLabel(type)}
          </option>
        ))}
      </Select>
      <Input
        aria-label={t("events.tagUnit", { n: position })}
        className="w-20"
        disabled={tag.type !== "number"}
        onChange={(event) => onChange({ unit: event.target.value })}
        placeholder={t("events.unit")}
        value={tag.type === "number" ? tag.unit : ""}
      />
      <Button
        aria-label={t("events.tagImportant", { n: position })}
        aria-pressed={Boolean(tag.important)}
        onClick={() => onChange({ important: !tag.important })}
        size="icon"
        title={t("events.importantHint")}
        type="button"
        variant="ghost"
      >
        <Star
          className={cn(
            "h-4 w-4",
            tag.important
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground",
          )}
        />
      </Button>
      <Button
        aria-label={t("events.tagRemove", { n: position })}
        onClick={onRemove}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}
