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
  Trash2,
  TrendingUp,
  Upload,
} from "lucide-react";

import { ClearFiltersButton } from "@/components/ClearFiltersButton";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { EmptyState } from "@/components/EmptyState";
import { ItemFormShell } from "@/components/ItemFormShell";
import { ListItemTitle } from "@/components/ListItemTitle";
import { MarkdownEditor, MarkdownPreview } from "@/components/MarkdownEditor";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { dateInputToIso, formatDate } from "@/lib/date";
import { useClearFiltersOnEscape } from "@/hooks/use-clear-filters-on-escape";
import { cn } from "@/lib/utils";
import type { ListViewProps } from "@/modules/types";
import { useVaultStore } from "@/stores/vault-store";
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
  STATUS_LABELS,
  TAG_TYPE_LABELS,
  trackedEvents,
  updateTrackedEvent,
  upsertDay,
  validateEventInput,
} from "./logic";
import { TimelineView } from "./TimelineView";
import { TrendingView } from "./TrendingView";
import {
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
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_BADGE_CLASSES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function dateRangeLabel(event: TrackedEvent): string {
  const range = eventDateRange(event);
  if (!range) return "Nothing tracked yet";
  const first = formatDate(dateInputToIso(range.first));
  const last = formatDate(dateInputToIso(range.last));
  const days = `${event.days.length} ${event.days.length === 1 ? "day" : "days"}`;
  return first === last ? `${first} · ${days}` : `${first} – ${last} · ${days}`;
}

export function EventsListView({
  items,
  focusItemId,
  onFocusItemHandled,
}: ListViewProps<TrackedEvent>) {
  const saveEvent = useVaultStore((s) => s.saveEvent);
  const deleteEvent = useVaultStore((s) => s.deleteEvent);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<EventStatus | "">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TrackedEvent | null | undefined>();
  const [pendingDelete, setPendingDelete] = useState<TrackedEvent | null>(null);

  const events = useMemo(() => sortEvents(trackedEvents(items)), [items]);
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

  useEffect(() => {
    if (!focusItemId) return;
    if (!events.some((event) => event.id === focusItemId)) return;
    setSelectedId(focusItemId);
    onFocusItemHandled?.();
  }, [focusItemId, events, onFocusItemHandled]);

  async function handleSave(entry: TrackedEvent) {
    await saveEvent(entry);
    setEditing(undefined);
    setSelectedId(entry.id);
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
        onSave={(entry) => void handleSave(entry)}
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
          onSave={(entry) => void saveEvent(entry)}
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
          <h1 className="text-lg font-semibold">Event Tracker</h1>
          <p className="text-sm text-muted-foreground">
            {events.length} tracked {events.length === 1 ? "event" : "events"}
          </p>
        </div>
        <Button onClick={startCreate}>
          <Plus className="h-4 w-4" />
          New
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <Select
            aria-label="Filter by status"
            className="sm:w-40"
            onChange={(event) =>
              setStatusFilter(event.target.value as EventStatus | "")
            }
            value={statusFilter}
          >
            <option value="">All statuses</option>
            {EVENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Filter events"
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter events"
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
              title="No matches"
              description="No event matches these filters."
            />
          ) : (
            <EmptyState
              title="No events yet"
              description="Track something over time — a child's growth, sleep, a treatment — day by day."
              action={
                <Button onClick={startCreate}>
                  <Plus className="h-4 w-4" />
                  New event
                </Button>
              }
            />
          )
        ) : (
          <ul className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
            {filtered.map((event) => (
              <li
                className="rounded-md border border-border bg-card p-3 hover:bg-accent/40"
                key={event.id}
              >
                <div className="flex items-center gap-2">
                  <ListItemTitle
                    className="min-w-0 flex-1 truncate text-xl leading-7"
                    onOpen={() => setSelectedId(event.id)}
                  >
                    {event.title}
                  </ListItemTitle>
                  <StatusBadge status={event.status} />
                  <div className="-mr-1.5 shrink-0 [&_button]:h-7 [&_button]:w-7">
                    <RowActionsMenu
                      label={`Actions for ${event.title}`}
                      actions={[
                        {
                          label: "Open",
                          icon: <CalendarDays className="h-4 w-4" />,
                          onSelect: () => setSelectedId(event.id),
                        },
                        {
                          label: "Edit",
                          icon: <Pencil className="h-4 w-4" />,
                          onSelect: () => setEditing(event),
                        },
                        {
                          label: "Delete",
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
          aria-label="Back to events"
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
          aria-label="Event status"
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
              {STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
        <ButtonGroup<EventViewMode>
          aria-label="Event view"
          onValueChange={setMode}
          options={[
            {
              value: "calendar",
              label: "Calendar",
              icon: <CalendarDays className="h-4 w-4" />,
            },
            {
              value: "timeline",
              label: "Timeline",
              icon: <ChartGantt className="h-4 w-4" />,
            },
            {
              value: "trending",
              label: "Trending",
              icon: <TrendingUp className="h-4 w-4" />,
            },
          ]}
          role="tablist"
          value={mode}
        />
        <RowActionsMenu
          label={`Actions for ${event.title}`}
          actions={[
            {
              label: "Edit",
              icon: <Pencil className="h-4 w-4" />,
              onSelect: onEdit,
            },
            {
              label: "Import CSV",
              icon: <Upload className="h-4 w-4" />,
              onSelect: () => importInputRef.current?.click(),
            },
            {
              label: "Delete",
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
            Description
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
      cancelLabel="Cancel"
      description="Tags are quick fields you fill in on each tracked day."
      error={error}
      mode={item ? "edit" : "create"}
      onCancel={onCancel}
      onSubmit={submit}
      title={item ? "Edit event" : "New event"}
    >
      <div className="col-span-2 grid grid-cols-4 gap-4">
        <label className="col-span-3 space-y-1 text-sm font-medium">
          Title
          <Input
            aria-label="Event title"
            onChange={(event) => update("title", event.target.value)}
            placeholder="e.g. Height of my son"
            value={form.title}
          />
        </label>
        <label className="col-span-1 space-y-1 text-sm font-medium">
          Status
          <Select
            aria-label="Status"
            onChange={(event) =>
              update("status", event.target.value as EventStatus)
            }
            value={form.status}
          >
            {EVENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <section className="col-span-2 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Tags</h2>
          <Button
            onClick={() => update("tags", [...form.tags, createTag()])}
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus className="h-4 w-4" />
            Add tag
          </Button>
        </div>
        {form.tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            e.g. “Sleeping pills” (number), “Sleep” (number, unit h), “Vivid
            dreams” (yes / no).
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
            Removing a tag also removes the values tracked for it.
          </p>
        ) : null}
      </section>

      <div className="col-span-2 space-y-1 text-sm font-medium">
        Description
        <MarkdownEditor
          ariaLabel="Event description"
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
  return (
    <li className="flex items-center gap-2">
      <TagIconPicker
        label={`Tag ${position} icon`}
        onChange={(icon) => onChange({ icon })}
        value={tag.icon}
      />
      <Input
        aria-label={`Tag ${position} name`}
        className="flex-1"
        onChange={(event) => onChange({ name: event.target.value })}
        placeholder="Name"
        value={tag.name}
      />
      <Select
        aria-label={`Tag ${position} type`}
        className="w-32"
        onChange={(event) =>
          onChange({ type: event.target.value as EventTag["type"] })
        }
        value={tag.type}
      >
        {TAG_TYPES.map((type) => (
          <option key={type} value={type}>
            {TAG_TYPE_LABELS[type]}
          </option>
        ))}
      </Select>
      <Input
        aria-label={`Tag ${position} unit`}
        className="w-20"
        disabled={tag.type !== "number"}
        onChange={(event) => onChange({ unit: event.target.value })}
        placeholder="Unit"
        value={tag.type === "number" ? tag.unit : ""}
      />
      <Button
        aria-label={`Remove tag ${position}`}
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
