import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ChevronLeft, ChevronRight, Download, Music, X } from "lucide-react";

import {
  IMAGE_STAGE_CLASS,
  useImageZoom,
  ViewerButton,
  ZoomControls,
  ZOOMABLE_IMAGE_CLASS,
} from "@/components/image-zoom";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { fileSrc, previewKind } from "./logic";
import type { FileEntry } from "./types";

/**
 * Full-screen preview of a stored file: images zoom and pan, PDFs open in the WebView's own reader,
 * audio and video use native controls. Everything streams from the `ownkeep-file` scheme, so nothing
 * larger than the part being viewed is ever decrypted into the WebView.
 */
export function FileViewer({
  files,
  initialIndex,
  onClose,
  onSaveCopy,
}: {
  /** The previewable files to step through. */
  files: FileEntry[];
  initialIndex: number;
  onClose: () => void;
  onSaveCopy: (file: FileEntry) => void;
}) {
  const { t } = useT();
  const [index, setIndex] = useState(initialIndex);
  const [failedId, setFailedId] = useState<string | null>(null);
  const zoom = useImageZoom();
  const rootRef = useRef<HTMLDivElement>(null);
  const file = files[index];

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  if (!file) return null;

  const kind = previewKind(file);
  const failed = failedId === file.id;
  const isImage = kind === "image" && !failed;
  const isMedia = kind === "audio" || kind === "video";

  function step(amount: number) {
    if (files.length < 2) return;
    setIndex((current) => (current + amount + files.length) % files.length);
    zoom.reset();
  }

  // Arrow keys belong to the player while audio or video is showing: they seek.
  const keyActions: Record<string, () => void> = {
    Escape: onClose,
    ...(isMedia
      ? {}
      : { ArrowLeft: () => step(-1), ArrowRight: () => step(1) }),
    ...(isImage ? zoom.keyActions : {}),
  };

  const stepButtons =
    files.length > 1 ? (
      <>
        <ViewerButton
          className="absolute left-4 top-1/2 -translate-y-1/2"
          label={t("files.previous")}
          onClick={() => step(-1)}
        >
          <ChevronLeft className="h-5 w-5" />
        </ViewerButton>
        <ViewerButton
          className="absolute right-4 top-1/2 -translate-y-1/2"
          label={t("files.next")}
          onClick={() => step(1)}
        >
          <ChevronRight className="h-5 w-5" />
        </ViewerButton>
      </>
    ) : null;

  const markFailed = () => setFailedId(file.id);
  const src = fileSrc(file);

  return createPortal(
    <div
      aria-label={t("files.previewNamed", { name: file.title })}
      aria-modal="true"
      className="fixed inset-0 z-[60] flex flex-col bg-black/95 text-white outline-none"
      onKeyDown={(event) => {
        const action = keyActions[event.key];
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        action();
      }}
      ref={rootRef}
      role="dialog"
      tabIndex={-1}
    >
      <header className="flex shrink-0 items-center gap-2 px-4 py-3">
        <p className="min-w-0 flex-1 truncate text-sm">
          {file.title}
          {files.length > 1 ? (
            <span className="ml-2 text-white/60">
              {index + 1} / {files.length}
            </span>
          ) : null}
        </p>
        {file.invalid ? (
          <span className="shrink-0 rounded border border-red-400 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-red-300">
            {t("files.invalid")}
          </span>
        ) : null}
        {isImage ? <ZoomControls zoom={zoom} /> : null}
        <ViewerButton
          label={t("files.saveCopy")}
          onClick={() => onSaveCopy(file)}
        >
          <Download className="h-4 w-4" />
        </ViewerButton>
        <ViewerButton label={t("common.close")} onClick={onClose}>
          <X className="h-4 w-4" />
        </ViewerButton>
      </header>

      {failed ? (
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-16 pb-4 text-center text-sm text-white/80">
          <p>{t("files.previewFailed")}</p>
          <Button
            onClick={() => onSaveCopy(file)}
            type="button"
            variant="secondary"
          >
            <Download className="h-4 w-4" />
            {t("files.saveCopy")}
          </Button>
          {stepButtons}
        </div>
      ) : kind === "image" ? (
        <div
          className={IMAGE_STAGE_CLASS}
          data-testid="image-stage"
          ref={zoom.stageRef}
          {...zoom.stageProps}
        >
          <img
            alt={file.title}
            className={ZOOMABLE_IMAGE_CLASS}
            draggable={false}
            onError={markFailed}
            src={src}
            style={zoom.imageStyle}
          />
          {stepButtons}
        </div>
      ) : kind === "pdf" ? (
        <div className="relative flex min-h-0 flex-1 px-16 pb-4">
          <iframe
            className="h-full w-full rounded-md bg-white"
            src={src}
            title={file.title}
          />
          {stepButtons}
        </div>
      ) : kind === "video" ? (
        <div className="relative flex min-h-0 flex-1 items-center justify-center px-16 pb-4">
          <video
            className="max-h-full max-w-full"
            controls
            key={file.id}
            onError={markFailed}
            preload="metadata"
            src={src}
          />
          {stepButtons}
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-16 pb-4">
          <Music className="h-16 w-16 text-white/40" />
          <audio
            className="w-full max-w-xl"
            controls
            key={file.id}
            onError={markFailed}
            preload="metadata"
            src={src}
          />
          {stepButtons}
        </div>
      )}
    </div>,
    document.body,
  );
}
