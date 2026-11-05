import {
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
  useRef,
  useState,
} from "react";

import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

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

/** Zoom + pan state for a full-screen image: wheel, double-click, drag, buttons and keys. */
export function useImageZoom() {
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  function focusPoint(clientX: number, clientY: number) {
    const rect = stageRef.current!.getBoundingClientRect();
    return {
      x: clientX - (rect.left + rect.width / 2),
      y: clientY - (rect.top + rect.height / 2),
    };
  }

  const zoomIn = () =>
    setTransform((current) => zoomAround(current, current.scale * ZOOM_STEP));
  const zoomOut = () =>
    setTransform((current) => zoomAround(current, current.scale / ZOOM_STEP));
  const reset = () => setTransform(IDENTITY);
  const endDrag = () => {
    dragRef.current = null;
  };

  return {
    scale: transform.scale,
    zoomIn,
    zoomOut,
    reset,
    stageRef,
    keyActions: {
      "+": zoomIn,
      "=": zoomIn,
      "-": zoomOut,
      "0": reset,
    } as Record<string, () => void>,
    imageStyle: {
      transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
    },
    stageProps: {
      onDoubleClick(event: { clientX: number; clientY: number }) {
        const focus = focusPoint(event.clientX, event.clientY);
        setTransform((current) =>
          current.scale > 1
            ? IDENTITY
            : zoomAround(current, DOUBLE_CLICK_SCALE, focus),
        );
      },
      onPointerCancel: endDrag,
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        dragRef.current = { x: event.clientX, y: event.clientY };
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        const last = dragRef.current;
        if (!last) return;
        dragRef.current = { x: event.clientX, y: event.clientY };
        setTransform((current) => ({
          ...current,
          x: current.x + event.clientX - last.x,
          y: current.y + event.clientY - last.y,
        }));
      },
      onPointerUp: endDrag,
      onWheel(event: WheelEvent<HTMLDivElement>) {
        const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
        const focus = focusPoint(event.clientX, event.clientY);
        setTransform((current) =>
          zoomAround(current, current.scale * factor, focus),
        );
      },
    },
  };
}

/** The classes every zoomable image stage shares. */
export const IMAGE_STAGE_CLASS =
  "relative flex min-h-0 flex-1 cursor-grab touch-none select-none items-center justify-center overflow-hidden outline-none active:cursor-grabbing";
export const ZOOMABLE_IMAGE_CLASS =
  "absolute inset-0 m-auto max-h-full max-w-full object-contain";

/** Percent readout + zoom out / in / reset, for a viewer's dark header. */
export function ZoomControls({
  zoom,
}: {
  zoom: Pick<
    ReturnType<typeof useImageZoom>,
    "scale" | "zoomIn" | "zoomOut" | "reset"
  >;
}) {
  const { t } = useT();
  return (
    <>
      <span className="w-14 text-right text-xs tabular-nums text-white/70">
        {Math.round(zoom.scale * 100)}%
      </span>
      <ViewerButton label={t("events.zoomOut")} onClick={zoom.zoomOut}>
        <ZoomOut className="h-4 w-4" />
      </ViewerButton>
      <ViewerButton label={t("events.zoomIn")} onClick={zoom.zoomIn}>
        <ZoomIn className="h-4 w-4" />
      </ViewerButton>
      <ViewerButton label={t("events.resetZoom")} onClick={zoom.reset}>
        <RotateCcw className="h-4 w-4" />
      </ViewerButton>
    </>
  );
}

export function ViewerButton({
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
