import { useState } from "react";

import { Flag, Pencil, Trash2 } from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { DetailModal } from "@/components/DetailModal";
import { Button } from "@/components/ui/button";
import { dateInputToIso, formatDate } from "@/lib/date";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { AttachmentTile } from "./AttachmentTile";
import { AttachmentViewer } from "./AttachmentViewer";
import { TagIcon } from "./icons";
import {
  dayFor,
  formatTagValue,
  importantFirst,
  trackedTagValues,
} from "./logic";
import type { EventAttachment, TrackedEvent } from "./types";

/** Read-only view of one tracked day, with Edit / Delete. */
export function DayView({
  event,
  date,
  onClose,
  onEdit,
  onDelete,
}: {
  event: TrackedEvent;
  /** The day to show; `null` (or a day with no record) keeps the modal closed. */
  date: string | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useT();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [viewing, setViewing] = useState<{
    attachments: EventAttachment[];
    index: number;
  } | null>(null);
  const day = date ? dayFor(event, date) : undefined;
  const dateLabel = date ? formatDate(dateInputToIso(date)) : "";
  const tags = day ? trackedTagValues(event, day) : [];

  return (
    <>
      <DetailModal
        actions={
          <>
            <Button
              onClick={() => setConfirmingDelete(true)}
              type="button"
              variant="destructive"
            >
              <Trash2 className="h-4 w-4" />
              {t("common.delete")}
            </Button>
            <Button
              className="ml-auto"
              onClick={onEdit}
              type="button"
              variant="outline"
            >
              <Pencil className="h-4 w-4" />
              {t("common.edit")}
            </Button>
          </>
        }
        ariaLabel={`${dateLabel} · ${event.title}`}
        beforeClose={
          day?.milestone ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
              <Flag className="h-3 w-3 fill-current" />
              {t("events.milestone")}
            </span>
          ) : null
        }
        onClose={onClose}
        open={day !== undefined}
        title={
          <>
            <span className="truncate">{dateLabel}</span>
            <span className="ml-2 shrink-0 font-normal text-muted-foreground">
              {event.title}
            </span>
          </>
        }
        titleClassName="flex items-center text-base"
      >
        {day ? (
          <div className="space-y-5 p-5 text-sm">
            {tags.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase text-muted-foreground">
                  {t("field.tags")}
                </h3>
                <dl className="grid grid-cols-2 gap-2">
                  {importantFirst(tags).map(({ tag, value }) => (
                    <div
                      className={cn(
                        "flex items-center gap-2 rounded-md border px-3 py-2",
                        tag.important
                          ? "border-primary bg-primary/10"
                          : "border-border bg-muted/30",
                      )}
                      key={tag.id}
                    >
                      <TagIcon
                        className="h-4 w-4 text-muted-foreground"
                        icon={tag.icon}
                      />
                      <dt className="min-w-0 flex-1 truncate">{tag.name}</dt>
                      <dd className="font-semibold tabular-nums">
                        {formatTagValue(tag, value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            {day.items.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase text-muted-foreground">
                  {t("events.items")}
                </h3>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {day.items.map((item) => (
                    <li className="space-y-2 px-3 py-2" key={item.id}>
                      <div className="flex items-baseline gap-3">
                        <span className="min-w-0 flex-1 text-muted-foreground">
                          {item.label}
                        </span>
                        {item.value ? (
                          <span className="text-right font-medium">
                            {item.value}
                          </span>
                        ) : null}
                      </div>
                      {item.images.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {item.images.map((attachment, index) => (
                            <AttachmentTile
                              attachment={attachment}
                              key={attachment.id}
                              onOpen={() =>
                                setViewing({ attachments: item.images, index })
                              }
                            />
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {day.note ? (
              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase text-muted-foreground">
                  {t("finance.note")}
                </h3>
                <p className="whitespace-pre-line break-words rounded-md bg-muted/70 px-3 py-2">
                  {day.note}
                </p>
              </section>
            ) : null}

            {tags.length === 0 && day.items.length === 0 && !day.note ? (
              <p className="text-muted-foreground">
                {t("events.milestoneOnly")}
              </p>
            ) : null}
          </div>
        ) : null}
      </DetailModal>

      <ConfirmDeleteDialog
        itemName={`${dateLabel} · ${event.title}`}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => {
          setConfirmingDelete(false);
          onDelete();
        }}
        open={confirmingDelete}
      />
      {viewing ? (
        <AttachmentViewer
          attachments={viewing.attachments}
          initialIndex={viewing.index}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </>
  );
}
