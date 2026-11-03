import {
  type MouseEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { DatePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { dateInputToIso, formatDate } from "@/lib/date";
import {
  dateTicks,
  daysBetween,
  defaultTrendRange,
  eventYears,
  formatTimeSpan,
  niceTicks,
  numericTags,
  pointsInRange,
  presetRange,
  RANGE_PRESETS,
  sameRange,
  setRangeEnd,
  yearRange,
  todayKey,
  trendSeries,
  trendSummary,
  type DateRange,
  type RangePresetId,
  type TrendPoint,
} from "./logic";
import type { EventTag, TrackedEvent } from "./types";

/** Fallback before layout (and in jsdom, which has no layout). */
const FALLBACK_WIDTH = 720;
const CHART_HEIGHT = 280;
const MARGIN = { top: 16, right: 20, bottom: 28, left: 52 };
const Y_TICK_TARGET = 5;
const X_TICK_TARGET = 6;
const MARKER_RADIUS = 4;
const TOOLTIP_WIDTH = 140;

function formatNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}

function formatValue(value: number, tag: EventTag): string {
  return `${formatNumber(value)}${tag.unit}`;
}

function formatChange(change: number, tag: EventTag): string {
  const sign = change > 0 ? "+" : change < 0 ? "−" : "±";
  return `${sign}${formatValue(Math.abs(change), tag)}`;
}

function shortDate(date: string, withYear: boolean): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "2-digit" } : {}),
  });
}

export function TrendingView({
  event,
  onOpenDay,
}: {
  event: TrackedEvent;
  onOpenDay: (date: string) => void;
}) {
  const tags = useMemo(() => numericTags(event), [event]);
  const [tagId, setTagId] = useState(() => tags[0]?.id ?? "");
  const today = todayKey();
  const defaultRange = defaultTrendRange(event, today);
  const years = eventYears(event, today);
  const [range, setRange] = useState<DateRange>(defaultRange);
  const tag = tags.find((candidate) => candidate.id === tagId) ?? tags[0];
  const allPoints = useMemo(
    () => (tag ? trendSeries(event, tag.id) : []),
    [event, tag],
  );
  const points = pointsInRange(allPoints, range);
  const summary = trendSummary(points);
  const isDefaultRange = sameRange(range, defaultRange);
  const activePreset = RANGE_PRESETS.find((preset) =>
    sameRange(range, presetRange(preset.id, today)),
  );
  const activeYear = years.find((year) =>
    sameRange(range, yearRange(year, today)),
  );

  if (!tag) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Trending charts a number tag over time. Edit this event and add a tag of
        type Number to start.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Trend tag"
          className="w-48"
          onChange={(change) => setTagId(change.target.value)}
          value={tag.id}
        >
          {tags.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Recent range"
          className="w-28"
          onChange={(change) => {
            if (change.target.value) {
              setRange(
                presetRange(change.target.value as RangePresetId, today),
              );
            }
          }}
          value={activePreset?.id ?? ""}
        >
          <option value="">最近</option>
          {RANGE_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              最近 {preset.label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Year"
          className="w-28"
          onChange={(change) => {
            if (change.target.value)
              setRange(yearRange(Number(change.target.value), today));
          }}
          value={activeYear ?? ""}
        >
          <option value="">年份</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <DatePicker
            aria-label="From date"
            className="w-40"
            onChange={(date) =>
              setRange((current) => setRangeEnd(current, "from", date))
            }
            value={range.from}
          />
          <span className="text-sm text-muted-foreground">–</span>
          <DatePicker
            aria-label="To date"
            className="w-40"
            onChange={(date) =>
              setRange((current) => setRangeEnd(current, "to", date))
            }
            value={range.to}
          />
          {isDefaultRange ? null : (
            <Button
              onClick={() => setRange(defaultRange)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      {summary ? (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Time Spanning", value: formatTimeSpan(range) },
              { label: "Change", value: formatChange(summary.change, tag) },
              { label: "Min", value: formatValue(summary.min, tag) },
              { label: "Max", value: formatValue(summary.max, tag) },
            ].map((stat) => (
              <div
                className="rounded-md border border-border bg-card px-3 py-2"
                key={stat.label}
              >
                <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
          <TrendChart
            onOpenDay={onOpenDay}
            points={points}
            range={range}
            tag={tag}
          />
          <TrendTable points={points} tag={tag} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {allPoints.length === 0
            ? `No values tracked for ${tag.name} yet. Fill it in on a calendar day.`
            : `No values for ${tag.name} in this date range.`}
        </p>
      )}
    </div>
  );
}

function TrendChart({
  points,
  range,
  tag,
  onOpenDay,
}: {
  points: TrendPoint[];
  /** The x-axis spans the whole selected range, not just the dates that have values. */
  range: DateRange;
  tag: EventTag;
  onOpenDay: (date: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const [hovered, setHovered] = useState<number | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current!;
    const measure = () => setWidth(host.clientWidth || FALLBACK_WIDTH);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const first = range.from;
  const last = range.to;
  const span = daysBetween(first, last);
  const plotWidth = Math.max(1, width - MARGIN.left - MARGIN.right);
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

  const values = points.map((point) => point.value);
  const yTicks = niceTicks(
    Math.min(...values),
    Math.max(...values),
    Y_TICK_TARGET,
  );
  const yMin = yTicks[0];
  const yMax = yTicks[yTicks.length - 1];
  const yOf = (value: number) =>
    MARGIN.top + plotHeight - ((value - yMin) / (yMax - yMin)) * plotHeight;

  const offsets = points.map((point) => daysBetween(first, point.date));
  // Keep end markers inside the plot.
  const inset = MARKER_RADIUS + 2;
  const xOf = (offset: number) =>
    span === 0
      ? MARGIN.left + plotWidth / 2
      : MARGIN.left + inset + (offset / span) * (plotWidth - inset * 2);
  const xs = offsets.map(xOf);
  const withYear = first.slice(0, 4) !== last.slice(0, 4);
  const linePath = xs
    .map((x, index) => `${index === 0 ? "M" : "L"}${x},${yOf(values[index])}`)
    .join(" ");

  function nearestIndex(pointer: MouseEvent<SVGRectElement>): number {
    const rect = pointer.currentTarget.getBoundingClientRect();
    const x = MARGIN.left + (pointer.clientX - rect.left);
    return xs.reduce(
      (best, candidate, index) =>
        Math.abs(candidate - x) < Math.abs(xs[best] - x) ? index : best,
      0,
    );
  }

  const active = hovered === null ? null : points[hovered];
  const activeX = hovered === null ? 0 : xs[hovered];
  const tooltipLeft = Math.min(
    Math.max(activeX - TOOLTIP_WIDTH / 2, 0),
    width - TOOLTIP_WIDTH,
  );

  return (
    <figure className="rounded-md border border-border bg-card p-3">
      <figcaption className="mb-1 text-sm font-medium">
        {tag.name}
        {tag.unit ? (
          <span className="text-muted-foreground"> ({tag.unit})</span>
        ) : null}
      </figcaption>
      <div className="relative" ref={hostRef}>
        <svg
          aria-label={`${tag.name} line chart`}
          className="block overflow-visible"
          height={CHART_HEIGHT}
          role="img"
          width={width}
        >
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                className="stroke-border"
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={yOf(tick)}
                y2={yOf(tick)}
              />
              <text
                className="fill-muted-foreground text-[11px] tabular-nums"
                dominantBaseline="middle"
                textAnchor="end"
                x={MARGIN.left - 8}
                y={yOf(tick)}
              >
                {formatNumber(tick)}
              </text>
            </g>
          ))}
          {dateTicks(first, last, X_TICK_TARGET).map((date) => (
            <text
              className="fill-muted-foreground text-[11px]"
              key={date}
              textAnchor="middle"
              x={xOf(daysBetween(first, date))}
              y={CHART_HEIGHT - 8}
            >
              {shortDate(date, withYear)}
            </text>
          ))}

          {active ? (
            <line
              className="stroke-muted-foreground/50"
              strokeDasharray="3 3"
              x1={activeX}
              x2={activeX}
              y1={MARGIN.top}
              y2={MARGIN.top + plotHeight}
            />
          ) : null}

          <path
            className="fill-none stroke-primary"
            d={linePath}
            data-testid="trend-line"
            strokeLinejoin="round"
            strokeWidth={2}
          />
          {points.map((point, index) => (
            <circle
              className="fill-primary stroke-card"
              cx={xs[index]}
              cy={yOf(point.value)}
              key={point.date}
              r={hovered === index ? MARKER_RADIUS + 1.5 : MARKER_RADIUS}
              strokeWidth={2}
            />
          ))}

          {/* One hit target over the whole plot: nearest-by-date is easier to hit than a dot. */}
          <rect
            className="cursor-pointer"
            data-testid="trend-hit"
            fill="transparent"
            height={plotHeight}
            onClick={(pointer) => onOpenDay(points[nearestIndex(pointer)].date)}
            onPointerLeave={() => setHovered(null)}
            onPointerMove={(pointer) => setHovered(nearestIndex(pointer))}
            width={plotWidth}
            x={MARGIN.left}
            y={MARGIN.top}
          />
        </svg>
        {active ? (
          <div
            className="pointer-events-none absolute top-0 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
            role="status"
            style={{ left: tooltipLeft, width: TOOLTIP_WIDTH }}
          >
            <p className="text-muted-foreground">
              {formatDate(dateInputToIso(active.date))}
            </p>
            <p className="font-semibold tabular-nums">
              {formatValue(active.value, tag)}
            </p>
          </div>
        ) : null}
      </div>
    </figure>
  );
}

function TrendTable({ points, tag }: { points: TrendPoint[]; tag: EventTag }) {
  return (
    <details className="rounded-md border border-border bg-card text-sm">
      <summary className="cursor-pointer px-3 py-2 font-medium">
        Values ({points.length})
      </summary>
      <table className="w-full border-t border-border">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-1.5 text-left font-medium">Date</th>
            <th className="px-3 py-1.5 text-right font-medium">{tag.name}</th>
          </tr>
        </thead>
        <tbody>
          {[...points].reverse().map((point) => (
            <tr className="border-t border-border" key={point.date}>
              <td className="px-3 py-1.5">
                {formatDate(dateInputToIso(point.date))}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {formatValue(point.value, tag)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
