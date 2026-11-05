import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { ChevronLeft, ChevronRight, X } from "lucide-react";

import {
  IMAGE_STAGE_CLASS,
  useImageZoom,
  ViewerButton,
  ZoomControls,
  ZOOMABLE_IMAGE_CLASS,
} from "@/components/image-zoom";
import { useT } from "@/i18n";
import { dataUrlToBlob, isPdf } from "./attachment";
import type { EventAttachment } from "./types";

/** Full-screen photo viewer: wheel / buttons / keys to zoom, drag to pan, arrows to step. */
export function AttachmentViewer({
  attachments,
  initialIndex,
  onClose,
}: {
  attachments: EventAttachment[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { t } = useT();
  const [index, setIndex] = useState(initialIndex);
  const zoom = useImageZoom();
  const { stageRef } = zoom;
  const image = attachments[index];
  const pdf = image ? isPdf(image) : false;
  const pdfUrl = useMemo(
    () =>
      image && pdf ? URL.createObjectURL(dataUrlToBlob(image.dataUrl)) : null,
    [image, pdf],
  );
  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );

  function step(amount: number) {
    if (attachments.length < 2) return;
    setIndex(
      (current) => (current + amount + attachments.length) % attachments.length,
    );
    zoom.reset();
  }

  useEffect(() => {
    stageRef.current?.focus();
  }, [stageRef]);

  // A PDF zooms in the WebView's own reader, so photo zoom keys are left to it.
  const keyActions: Record<string, () => void> = {
    Escape: onClose,
    ArrowLeft: () => step(-1),
    ArrowRight: () => step(1),
    ...(pdf ? {} : zoom.keyActions),
  };

  if (!image) return null;

  const stepButtons =
    attachments.length > 1 ? (
      <>
        <ViewerButton
          className="absolute left-4 top-1/2 -translate-y-1/2"
          label={t("events.previousImage")}
          onClick={() => step(-1)}
        >
          <ChevronLeft className="h-5 w-5" />
        </ViewerButton>
        <ViewerButton
          className="absolute right-4 top-1/2 -translate-y-1/2"
          label={t("events.nextImage")}
          onClick={() => step(1)}
        >
          <ChevronRight className="h-5 w-5" />
        </ViewerButton>
      </>
    ) : null;

  return createPortal(
    <div
      aria-label={t(pdf ? "events.pdfNamed" : "events.imageNamed", {
        name: image.name,
      })}
      aria-modal="true"
      className="fixed inset-0 z-[60] flex flex-col bg-black/95 text-white"
      onKeyDown={(event) => {
        const action = keyActions[event.key];
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        action();
      }}
      role="dialog"
    >
      <header className="flex shrink-0 items-center gap-2 px-4 py-3">
        <p className="min-w-0 flex-1 truncate text-sm">
          {image.name}
          {attachments.length > 1 ? (
            <span className="ml-2 text-white/60">
              {index + 1} / {attachments.length}
            </span>
          ) : null}
        </p>
        {pdf ? null : <ZoomControls zoom={zoom} />}
        <ViewerButton label={t("events.closeImage")} onClick={onClose}>
          <X className="h-4 w-4" />
        </ViewerButton>
      </header>
      {pdf ? (
        <div className="relative flex min-h-0 flex-1 px-16 pb-4">
          <iframe
            className="h-full w-full rounded-md bg-white"
            src={pdfUrl ?? undefined}
            title={image.name}
          />
          {stepButtons}
        </div>
      ) : (
        <div
          className={IMAGE_STAGE_CLASS}
          data-testid="image-stage"
          ref={stageRef}
          tabIndex={-1}
          {...zoom.stageProps}
        >
          <img
            alt={image.name}
            className={ZOOMABLE_IMAGE_CLASS}
            draggable={false}
            src={image.dataUrl}
            style={zoom.imageStyle}
          />
          {stepButtons}
        </div>
      )}
    </div>,
    document.body,
  );
}
