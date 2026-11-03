import {
  type PointerEvent,
  type WheelEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Paperclip, Maximize2, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { type Locale, useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { TagIcon } from "./icons";
import { ItemLine } from "./ItemLine";
import {
  centerViewport,
  dateX,
  fitViewport,
  formatTagValue,
  panViewport,
  tickUnit,
  timelineFilterOptions,
  timelinePoints,
  timelineTicks,
  todayKey,
  visibleRange,
  zoomViewport,
  TIMELINE_DEFAULT_PX_PER_DAY,
  type TimelinePoint,
  type TimelineViewport,
} from "./logic";
import type { TrackedEvent } from "./types";

/** Fallback before layout (and in jsdom, which has no layout). */
const FALLBACK_WIDTH = 800;
const CARD_WIDTH = 176;
const CARD_HEIGHT = 92;
const LANE_GAP = 12;
const AXIS_GAP = 18;
const ZOOM_STEP = 1.5;
const WHEEL_ZOOM_SENSITIVITY = 0.01;
/** Pointer travel below this counts as a click, not a pan. */
const DRAG_THRESHOLD_PX = 4;
/** Lanes alternate above / below the axis, near then far, so neighbouring cards rarely overlap. */
const LANES = [
  { side: "above", depth: 0 },
  { side: "below", depth: 0 },
  { side: "above", depth: 1 },
  { side: "below", depth: 1 },
] as const;

function laneOffset(index: number): { top?: number; bottom?: number } {
  const lane = LANES[index % LANES.length];
  const distance = AXIS_GAP + lane.depth * (CARD_HEIGHT + LANE_GAP);
  return lane.side === "above" ? { bottom: distance } : { top: distance };
}

function initialViewport(
  points: TimelinePoint[],
  width: number,
  today: string,
): TimelineViewport {
  if (points.length === 0) {
    return centerViewport(today, width, TIMELINE_DEFAULT_PX_PER_DAY);
  }
  return fitViewport(
    points[0].date,
    points[points.length - 1].date,
    width,
    CARD_WIDTH / 2 + LANE_GAP,
  );
}

function tickLabel(
  date: string,
  unit: "day" | "month",
  locale: Locale,
): string {
  const value = new Date(`${date}T00:00:00`);
  if (unit === "month") {
    return value.toLocaleDateString(locale, {
      month: "short",
      year: "numeric",
    });
  }
  return date.endsWith("-01")
    ? value.toLocaleDateString(locale, { month: "short", day: "numeric" })
    : String(value.getDate());
}

export function TimelineView({
  event,
  onOpenDay,
}: {
  event: TrackedEvent;
  onOpenDay: (date: string) => void;
}) {
  const { t, locale } = useT();
  const today = todayKey();
  const [filter, setFilter] = useState("");
  // `locale` re-labels the "Everything" option after a language switch.
  const filterOptions = useMemo(
    () => timelineFilterOptions(event),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [event, locale],
  );
  const points = useMemo(() => timelinePoints(event, filter), [event, filter]);
  const stageRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const [viewport, setViewport] = useState<TimelineViewport>(() =>
    initialViewport(points, FALLBACK_WIDTH, today),
  );
  const dragRef = useRef<{ x: number; moved: number } | null>(null);
  const suppressClickRef = useRef(false);

  useLayoutEffect(() => {
    const stage = stageRef.current!;
    const measure = () => {
      const measured = stage.clientWidth || FALLBACK_WIDTH;
      setWidth(measured);
      return measured;
    };
    setViewport(initialViewport(points, measure(), today));
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(stage);
    return () => observer.disconnect();
    // Re-fit only when the filter changes — not after editing a day, so the view stays put.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Native listener: React's onWheel is passive, so it can't stop the pane from scrolling.
  useEffect(() => {
    const stage = stageRef.current!;
    const block = (wheel: globalThis.WheelEvent) => wheel.preventDefault();
    stage.addEventListener("wheel", block, { passive: false });
    return () => stage.removeEventListener("wheel", block);
  }, []);

  const range = visibleRange(viewport, width);
  const unit = tickUnit(viewport.pxPerDay);
  const ticks = timelineTicks(range.from, range.to, unit);
  const visiblePoints = points
    .map((point, index) => ({ point, index, x: dateX(viewport, point.date) }))
    .filter(({ x }) => x > -CARD_WIDTH && x < width + CARD_WIDTH);
  const todayX = dateX(viewport, today) + viewport.pxPerDay / 2;

  function zoomBy(factor: number, focusX = width / 2) {
    setViewport((current) => zoomViewport(current, factor, focusX));
  }

  function handleWheel(wheel: WheelEvent<HTMLDivElement>) {
    // Trackpad pinch arrives as ctrl+wheel on macOS.
    if (wheel.ctrlKey || wheel.metaKey) {
      const rect = wheel.currentTarget.getBoundingClientRect();
      zoomBy(
        Math.exp(-wheel.deltaY * WHEEL_ZOOM_SENSITIVITY),
        wheel.clientX - rect.left,
      );
      return;
    }
    const delta =
      Math.abs(wheel.deltaX) > Math.abs(wheel.deltaY)
        ? wheel.deltaX
        : wheel.deltaY;
    setViewport((current) => panViewport(current, -delta));
  }

  function handlePointerDown(pointer: PointerEvent<HTMLDivElement>) {
    dragRef.current = { x: pointer.clientX, moved: 0 };
    suppressClickRef.current = false;
  }

  function handlePointerMove(pointer: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = pointer.clientX - drag.x;
    drag.x = pointer.clientX;
    drag.moved += Math.abs(delta);
    // Capture only once it is a real drag: capturing on pointerdown would retarget the click
    // away from the card under the cursor.
    if (drag.moved > DRAG_THRESHOLD_PX && !suppressClickRef.current) {
      suppressClickRef.current = true;
      pointer.currentTarget.setPointerCapture?.(pointer.pointerId);
    }
    setViewport((current) => panViewport(current, delta));
  }

  function endDrag() {
    dragRef.current = null;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select
          aria-label={t("events.timelineFilter")}
          className="w-48"
          onChange={(change) => setFilter(change.target.value)}
          value={filter}
        >
          {filterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          Drag or scroll to pan · pinch or ⌘-scroll to zoom
        </p>
        <Button
          onClick={() =>
            setViewport(centerViewport(today, width, viewport.pxPerDay))
          }
          size="sm"
          type="button"
          variant="outline"
        >
          {t("events.today")}
        </Button>
        <Button
          aria-label={t("events.fitTimeline")}
          onClick={() => setViewport(initialViewport(points, width, today))}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button
          aria-label={t("events.zoomOutTimeline")}
          onClick={() => zoomBy(1 / ZOOM_STEP)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          aria-label={t("events.zoomInTimeline")}
          onClick={() => zoomBy(ZOOM_STEP)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      <div
        aria-label={t("events.view.timeline")}
        className="relative min-h-[440px] flex-1 cursor-grab touch-none select-none overflow-hidden rounded-md border border-border bg-card active:cursor-grabbing"
        data-testid="timeline-stage"
        onClickCapture={(click) => {
          if (!suppressClickRef.current) return;
          click.stopPropagation();
          suppressClickRef.current = false;
        }}
        onPointerCancel={endDrag}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onWheel={handleWheel}
        ref={stageRef}
        role="region"
      >
        {ticks.map((tick) => {
          const x = dateX(viewport, tick);
          return (
            <div
              className="pointer-events-none absolute inset-y-0 border-l border-border/60"
              key={tick}
              style={{ left: x }}
            >
              <span className="absolute left-1 top-1 whitespace-nowrap text-[11px] text-muted-foreground">
                {tickLabel(tick, unit, locale)}
              </span>
            </div>
          );
        })}

        {todayX > 0 && todayX < width ? (
          <div
            className="pointer-events-none absolute inset-y-0 border-l-2 border-primary/50"
            style={{ left: todayX }}
          >
            <span className="absolute bottom-1 left-1 text-[11px] font-medium text-primary">
              {t("events.today")}
            </span>
          </div>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t-2 border-border" />

        {visiblePoints.map(({ point, index, x }) => (
          <TimelineMarker
            centerX={x + viewport.pxPerDay / 2}
            index={index}
            key={point.date}
            onOpen={() => onOpenDay(point.date)}
            point={point}
          />
        ))}

        {points.length === 0 ? (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 mt-6 text-center text-sm text-muted-foreground">
            Nothing tracked yet{filter ? " for this filter" : ""}. Open a day in
            the calendar to start.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function TimelineMarker({
  point,
  index,
  centerX,
  onOpen,
}: {
  point: TimelinePoint;
  index: number;
  centerX: number;
  onOpen: () => void;
}) {
  const { t, locale } = useT();
  const offset = laneOffset(index);
  const attachmentCount = point.items.reduce(
    (total, item) => total + item.images.length,
    0,
  );
  const label = new Date(`${point.date}T00:00:00`).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      className="pointer-events-none absolute top-1/2"
      style={{ left: centerX }}
    >
      <span className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-card bg-primary" />
      <span
        className="absolute w-px bg-primary/40"
        style={
          offset.bottom !== undefined
            ? { bottom: 0, height: offset.bottom }
            : { top: 0, height: offset.top }
        }
      />
      <button
        aria-label={t("events.openDate", { date: point.date })}
        className={cn(
          "pointer-events-auto absolute flex flex-col gap-1 overflow-hidden [&>*]:shrink-0 rounded-md border border-border bg-background p-2 text-left text-xs shadow-sm transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        )}
        onClick={onOpen}
        style={{
          ...offset,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          left: -CARD_WIDTH / 2,
        }}
        type="button"
      >
        <span className="flex items-center justify-between font-medium">
          {label}
          {attachmentCount > 0 ? (
            <span className="inline-flex items-center gap-0.5 font-normal text-muted-foreground">
              <Paperclip className="h-3 w-3" />
              {attachmentCount}
            </span>
          ) : null}
        </span>
        {point.tags.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {point.tags.map(({ tag, value }) => (
              <span
                className="inline-flex items-center gap-0.5 rounded bg-secondary px-1 py-0.5 text-secondary-foreground"
                key={tag.id}
                title={tag.name}
              >
                <TagIcon className="h-3 w-3" icon={tag.icon} />
                {formatTagValue(tag, value)}
              </span>
            ))}
          </span>
        ) : null}
        {point.items.map((item) => (
          <ItemLine item={item} key={item.id} />
        ))}
        {point.note ? (
          <span className="truncate text-muted-foreground">{point.note}</span>
        ) : null}
      </button>
    </div>
  );
}
