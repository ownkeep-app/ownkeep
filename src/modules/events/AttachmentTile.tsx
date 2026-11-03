import { FileText } from "lucide-react";

import { useT } from "@/i18n";
import { isPdf } from "./attachment";
import type { EventAttachment } from "./types";

/** Square preview of a photo or PDF that opens it in the viewer. */
export function AttachmentTile({
  attachment,
  onOpen,
}: {
  attachment: EventAttachment;
  onOpen: () => void;
}) {
  const { t } = useT();
  return (
    <button
      aria-label={t("events.viewAttachment", { name: attachment.name })}
      className="block h-16 w-16 overflow-hidden rounded-md border border-border"
      onClick={onOpen}
      title={attachment.name}
      type="button"
    >
      {isPdf(attachment) ? (
        <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-muted/50 px-1 text-[10px] text-muted-foreground">
          <FileText className="h-5 w-5 text-red-500" />
          <span className="w-full truncate text-center">{attachment.name}</span>
        </span>
      ) : (
        <img
          alt=""
          className="h-full w-full object-cover"
          src={attachment.dataUrl}
        />
      )}
    </button>
  );
}
