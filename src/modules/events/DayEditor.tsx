import { type FormEvent, useId, useMemo, useState } from "react";

import { Flag, Loader2, Paperclip, Plus, Trash2, X } from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { ItemFormShell } from "@/components/ItemFormShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t as translate, useT } from "@/i18n";
import { formatDate, dateInputToIso } from "@/lib/date";
import { toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { TagIcon } from "./icons";
import { readAttachment } from "./attachment";
import { AttachmentTile } from "./AttachmentTile";
import { AttachmentViewer } from "./AttachmentViewer";
import {
  createEventItem,
  dayFor,
  emptyDay,
  itemValidationError,
  parseTagInput,
  tagInputValue,
} from "./logic";
import type {
  EventDay,
  EventAttachment,
  EventItem,
  EventTag,
  TagValue,
  TrackedEvent,
} from "./types";

/** Raw per-tag input: text for number/text tags, the toggle state for yes/no tags. */
type TagInputs = Record<string, string | boolean | undefined>;

function initialTagInputs(event: TrackedEvent, day: EventDay): TagInputs {
  return Object.fromEntries(
    event.tags.map((tag) => {
      const value = day.tagValues[tag.id];
      return [
        tag.id,
        tag.type === "boolean"
          ? (value as boolean | undefined)
          : tagInputValue(value),
      ];
    }),
  );
}

function tagValuesFromInputs(
  tags: EventTag[],
  inputs: TagInputs,
): { values: Record<string, TagValue>; error: string | null } {
  const values: Record<string, TagValue> = {};
  for (const tag of tags) {
    const input = inputs[tag.id];
    if (typeof input === "boolean") {
      values[tag.id] = input;
      continue;
    }
    if (!input?.trim()) continue;
    const parsed = parseTagInput(tag, input);
    if (parsed === undefined)
      return {
        values,
        error: translate("events.mustBeNumber", { name: tag.name }),
      };
    values[tag.id] = parsed;
  }
  return { values, error: null };
}

/** Labels already used on other days, offered as suggestions so `Height` stays `Height`. */
function knownItemLabels(event: TrackedEvent): string[] {
  const labels = new Set(
    event.days.flatMap((day) => day.items.map((item) => item.label)),
  );
  return [...labels].sort((left, right) => left.localeCompare(right));
}

export function DayEditor({
  event,
  date,
  onSave,
  onDelete,
  onCancel,
}: {
  event: TrackedEvent;
  date: string;
  onSave: (day: EventDay) => void;
  /** Removes the whole day record; offered only when the day already exists. */
  onDelete: () => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const existing = dayFor(event, date) ?? emptyDay(date);
  const [tagInputs, setTagInputs] = useState<TagInputs>(() =>
    initialTagInputs(event, existing),
  );
  const [items, setItems] = useState<EventItem[]>(existing.items);
  const [note, setNote] = useState(existing.note);
  const [milestone, setMilestone] = useState(Boolean(existing.milestone));
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isExisting = dayFor(event, date) !== undefined;
  const dateLabel = formatDate(dateInputToIso(date));
  const [viewing, setViewing] = useState<{
    images: EventAttachment[];
    index: number;
  } | null>(null);
  const labelListId = useId();
  const labelSuggestions = useMemo(() => knownItemLabels(event), [event]);

  function setTagInput(tagId: string, value: string | boolean | undefined) {
    setTagInputs((current) => ({ ...current, [tagId]: value }));
  }

  function updateItem(id: string, patch: Partial<EventItem>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const { values, error: tagError } = tagValuesFromInputs(
      event.tags,
      tagInputs,
    );
    const day: EventDay = { date, tagValues: values, items, note, milestone };
    const validation = tagError ?? itemValidationError(day);
    if (validation) {
      setError(validation);
      return;
    }
    onSave(day);
  }

  return (
    <>
      <ItemFormShell
        cancelLabel={t("common.cancel")}
        description={event.title}
        error={error}
        mode={isExisting ? "edit" : "create"}
        onCancel={onCancel}
        onSubmit={submit}
        secondaryAction={
          isExisting ? (
            <Button
              onClick={() => setConfirmingDelete(true)}
              type="button"
              variant="destructive"
            >
              <Trash2 className="h-4 w-4" />
              {t("events.deleteDay")}
            </Button>
          ) : null
        }
        title={dateLabel}
      >
        <button
          aria-pressed={milestone}
          className={cn(
            "col-span-2 flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
            milestone
              ? "border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300"
              : "border-border hover:bg-accent",
          )}
          onClick={() => setMilestone((current) => !current)}
          type="button"
        >
          <Flag className={cn("h-4 w-4", milestone && "fill-current")} />
          <span className="font-medium">{t("events.milestoneDay")}</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {t(milestone ? "events.milestoneOn" : "events.milestoneOff")}
          </span>
        </button>

        {event.tags.length > 0 ? (
          <section className="col-span-2 space-y-2">
            <h2 className="text-sm font-medium">{t("field.tags")}</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {event.tags.map((tag) => (
                <TagField
                  key={tag.id}
                  onChange={(value) => setTagInput(tag.id, value)}
                  tag={tag}
                  value={tagInputs[tag.id]}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="col-span-2 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">{t("events.items")}</h2>
            <Button
              onClick={() =>
                setItems((current) => [...current, createEventItem()])
              }
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus className="h-4 w-4" />
              {t("events.addItem")}
            </Button>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("events.itemsEmpty")}
            </p>
          ) : (
            <ul className="space-y-3">
              {items.map((item, index) => (
                <ItemRow
                  index={index}
                  item={item}
                  key={item.id}
                  labelListId={labelListId}
                  onChange={(patch) => updateItem(item.id, patch)}
                  onRemove={() =>
                    setItems((current) =>
                      current.filter((entry) => entry.id !== item.id),
                    )
                  }
                  onViewImage={(imageIndex) =>
                    setViewing({ images: item.images, index: imageIndex })
                  }
                />
              ))}
            </ul>
          )}
          <datalist id={labelListId}>
            {labelSuggestions.map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
        </section>

        <label className="col-span-2 space-y-1 text-sm font-medium">
          {t("finance.note")}
          <textarea
            aria-label={t("events.dayNote")}
            className="flex min-h-20 w-full rounded-md border border-input bg-card px-3 py-2 text-sm font-normal shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onChange={(changeEvent) => setNote(changeEvent.target.value)}
            value={note}
          />
        </label>
      </ItemFormShell>
      <ConfirmDeleteDialog
        itemName={`${dateLabel} · ${event.title}`}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={onDelete}
        open={confirmingDelete}
      />
      {viewing ? (
        <AttachmentViewer
          attachments={viewing.images}
          initialIndex={viewing.index}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </>
  );
}

function TagField({
  tag,
  value,
  onChange,
}: {
  tag: EventTag;
  value: string | boolean | undefined;
  onChange: (value: string | boolean | undefined) => void;
}) {
  const { t } = useT();
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
      <TagIcon className="h-4 w-4 text-muted-foreground" icon={tag.icon} />
      <span className="min-w-0 flex-1 truncate text-sm">{tag.name}</span>
      {tag.type === "boolean" ? (
        <div aria-label={tag.name} className="flex gap-1" role="radiogroup">
          {[
            { label: t("events.yes"), state: true },
            { label: t("events.no"), state: false },
          ].map((option) => (
            <button
              aria-checked={value === option.state}
              className={cn(
                "h-8 w-9 rounded-md border text-sm font-medium transition-colors",
                value === option.state
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-card hover:bg-accent",
              )}
              key={option.label}
              // Clicking the active choice again clears it — "not tracked" is a real state.
              onClick={() =>
                onChange(value === option.state ? undefined : option.state)
              }
              role="radio"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Input
            aria-label={tag.name}
            className={tag.type === "number" ? "w-24 text-right" : "w-40"}
            inputMode={tag.type === "number" ? "decimal" : undefined}
            onChange={(changeEvent) => onChange(changeEvent.target.value)}
            value={typeof value === "string" ? value : ""}
          />
          {tag.unit ? (
            <span className="w-8 text-sm text-muted-foreground">
              {tag.unit}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item,
  index,
  labelListId,
  onChange,
  onRemove,
  onViewImage,
}: {
  item: EventItem;
  index: number;
  labelListId: string;
  onChange: (patch: Partial<EventItem>) => void;
  onRemove: () => void;
  onViewImage: (index: number) => void;
}) {
  const { t } = useT();
  const [uploading, setUploading] = useState(false);
  const inputId = useId();
  const position = index + 1;

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    // One bad file (too big, wrong type) shouldn't drop the others picked with it.
    const results = await Promise.allSettled([...files].map(readAttachment));
    const added = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    if (added.length > 0) onChange({ images: [...item.images, ...added] });
    const failed = results.find((result) => result.status === "rejected");
    if (failed) {
      const reason = (failed as PromiseRejectedResult).reason;
      toastError(
        reason instanceof Error ? reason.message : t("events.fileAddFailed"),
      );
    }
    setUploading(false);
  }

  return (
    <li className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <Input
          aria-label={t("events.itemName", { n: position })}
          className="flex-1"
          list={labelListId}
          onChange={(event) => onChange({ label: event.target.value })}
          placeholder={t("events.itemNamePlaceholder")}
          value={item.label}
        />
        <Input
          aria-label={t("events.itemValue", { n: position })}
          className="flex-1"
          onChange={(event) => onChange({ value: event.target.value })}
          placeholder={t("events.itemValuePlaceholder")}
          value={item.value}
        />
        <label
          aria-label={t("events.itemAttach", { n: position })}
          className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-accent"
          htmlFor={inputId}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Paperclip className="h-4 w-4" />
          )}
        </label>
        <input
          accept="image/*,application/pdf,.pdf"
          className="sr-only"
          data-testid={`item-${position}-images`}
          id={inputId}
          multiple
          onChange={(event) => {
            void addFiles(event.target.files);
            event.target.value = "";
          }}
          type="file"
        />
        <Button
          aria-label={t("events.itemRemove", { n: position })}
          onClick={onRemove}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {item.images.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {item.images.map((image, imageIndex) => (
            <li className="group relative" key={image.id}>
              <AttachmentTile
                attachment={image}
                onOpen={() => onViewImage(imageIndex)}
              />
              <button
                aria-label={t("events.removeNamed", { name: image.name })}
                className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-foreground text-background group-focus-within:flex group-hover:flex"
                onClick={() =>
                  onChange({
                    images: item.images.filter(
                      (entry) => entry.id !== image.id,
                    ),
                  })
                }
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
