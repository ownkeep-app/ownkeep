import {
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { dataUrlToBlob, isPdf } from "./attachment";
import type { EventAttachment } from "./types";

const MIN_SCALE = 0.25;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.25;
const DOUBLE_CLICK_SCALE = 2.5;
const WHEEL_ZOOM_SENSITIVITY = 0.002;

interface Transform {
  scale: number;
  x: number;
  y: number;
}

const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * Keep the image point under `focus` (relative to the stage centre) fixed while scaling, so wheel
 * zoom feels anchored to the cursor.
 */
function zoomAround(
  current: Transform,
  nextScale: number,
  focus = { x: 0, y: 0 },
): Transform {
  const scale = clampScale(nextScale);
  const ratio = scale / current.scale;
  return {
    scale,
    x: focus.x - (focus.x - current.x) * ratio,
    y: focus.y - (focus.y - current.y) * ratio,
  };
}

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
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
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
    setTransform(IDENTITY);
  }

  useEffect(() => {
    stageRef.current?.focus();
  }, []);

  function focusPoint(clientX: number, clientY: number) {
    const rect = stageRef.current!.getBoundingClientRect();
    return {
      x: clientX - (rect.left + rect.width / 2),
      y: clientY - (rect.top + rect.height / 2),
    };
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
    const focus = focusPoint(event.clientX, event.clientY);
    setTransform((current) =>
      zoomAround(current, current.scale * factor, focus),
    );
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const last = dragRef.current;
    if (!last) return;
    dragRef.current = { x: event.clientX, y: event.clientY };
    setTransform((current) => ({
      ...current,
      x: current.x + event.clientX - last.x,
      y: current.y + event.clientY - last.y,
    }));
  }

  function endDrag() {
    dragRef.current = null;
  }

  const zoomKeys: Record<string, () => void> = {
    "+": () => setTransform((t) => zoomAround(t, t.scale * ZOOM_STEP)),
    "=": () => setTransform((t) => zoomAround(t, t.scale * ZOOM_STEP)),
    "-": () => setTransform((t) => zoomAround(t, t.scale / ZOOM_STEP)),
    "0": () => setTransform(IDENTITY),
  };
  // A PDF zooms in the WebView's own reader, so photo zoom keys are left to it.
  const keyActions: Record<string, () => void> = {
    Escape: onClose,
    ArrowLeft: () => step(-1),
    ArrowRight: () => step(1),
    ...(pdf ? {} : zoomKeys),
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
        {pdf ? null : (
          <>
            <span className="w-14 text-right text-xs tabular-nums text-white/70">
              {Math.round(transform.scale * 100)}%
            </span>
            <ViewerButton
              label={t("events.zoomOut")}
              onClick={() =>
                setTransform((t) => zoomAround(t, t.scale / ZOOM_STEP))
              }
            >
              <ZoomOut className="h-4 w-4" />
            </ViewerButton>
            <ViewerButton
              label={t("events.zoomIn")}
              onClick={() =>
                setTransform((t) => zoomAround(t, t.scale * ZOOM_STEP))
              }
            >
              <ZoomIn className="h-4 w-4" />
            </ViewerButton>
            <ViewerButton
              label={t("events.resetZoom")}
              onClick={() => setTransform(IDENTITY)}
            >
              <RotateCcw className="h-4 w-4" />
            </ViewerButton>
          </>
        )}
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
          className="relative flex min-h-0 flex-1 cursor-grab touch-none select-none items-center justify-center overflow-hidden outline-none active:cursor-grabbing"
          data-testid="image-stage"
          onDoubleClick={(event) => {
            const focus = focusPoint(event.clientX, event.clientY);
            setTransform((current) =>
              current.scale > 1
                ? IDENTITY
                : zoomAround(current, DOUBLE_CLICK_SCALE, focus),
            );
          }}
          onPointerCancel={endDrag}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onWheel={handleWheel}
          ref={stageRef}
          tabIndex={-1}
        >
          <img
            alt={image.name}
            className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
            draggable={false}
            src={image.dataUrl}
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            }}
          />
          {stepButtons}
        </div>
      )}
    </div>,
    document.body,
  );
}

function ViewerButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button
      aria-label={label}
      className={cn("text-white hover:bg-white/15 hover:text-white", className)}
      onClick={onClick}
      // Keep stage drags from starting when pressing an overlaid button.
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      size="icon"
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  );
}
