import { dateToDateInput, parseDateInput } from "@/lib/date";
import type { IndexEntry } from "@/modules/types";
import {
  EVENT_STATUSES,
  EVENTS_MODULE_ID,
  TAG_TYPES,
  type EventDay,
  type EventFormInput,
  type EventItem,
  type EventStatus,
  type EventTag,
  type TagValue,
  type TrackedEvent,
} from "./types";

const DAY_MS = 86_400_000;
const DEFAULT_TAG_ICON = "tag";
const TRUE_LABEL = "Y";
const FALSE_LABEL = "N";

export const STATUS_LABELS: Record<EventStatus, string> = {
  open: "Open",
  paused: "Paused",
  closed: "Closed",
};

export const TAG_TYPE_LABELS: Record<EventTag["type"], string> = {
  number: "Number",
  boolean: "Yes / No",
  text: "Text",
};

// ---------------------------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function isTrackedEvent(value: unknown): value is TrackedEvent {
  if (!isObject(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    EVENT_STATUSES.includes(value.status as EventStatus) &&
    Array.isArray(value.tags) &&
    Array.isArray(value.days) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

export function trackedEvents(items: unknown[]): TrackedEvent[] {
  return items.filter(isTrackedEvent);
}

// ---------------------------------------------------------------------------------------------
// Search index + list ordering
// ---------------------------------------------------------------------------------------------

export function buildEventIndex(items: TrackedEvent[]): IndexEntry[] {
  return items.map((item) => ({
    id: item.id,
    moduleId: EVENTS_MODULE_ID,
    type: "event",
    searchString: [
      item.title,
      item.description,
      ...item.tags.map((tag) => tag.name),
      ...item.days.flatMap((day) => [
        day.note,
        ...day.items.flatMap((entry) => [entry.label, entry.value]),
      ]),
    ]
      .filter(Boolean)
      .join(" "),
    displayLine: `${item.title} — ${STATUS_LABELS[item.status]}`,
  }));
}

/** Open first, then paused, then closed; most recently touched first within a status. */
export function sortEvents(items: TrackedEvent[]): TrackedEvent[] {
  return [...items].sort((left, right) => {
    const byStatus =
      EVENT_STATUSES.indexOf(left.status) -
      EVENT_STATUSES.indexOf(right.status);
    if (byStatus !== 0) return byStatus;
    const byUpdated = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    if (byUpdated !== 0) return byUpdated;
    return left.title.localeCompare(right.title);
  });
}

export function eventDateRange(
  event: TrackedEvent,
): { first: string; last: string } | null {
  if (event.days.length === 0) return null;
  return {
    first: event.days[0].date,
    last: event.days[event.days.length - 1].date,
  };
}

// ---------------------------------------------------------------------------------------------
// Event create / edit
// ---------------------------------------------------------------------------------------------

export function emptyEventForm(): EventFormInput {
  return { title: "", description: "", status: "open", tags: [] };
}

export function formFromEvent(item: TrackedEvent): EventFormInput {
  return {
    title: item.title,
    description: item.description,
    status: item.status,
    tags: item.tags.map((tag) => ({ ...tag })),
  };
}

export function createTag(id: string = crypto.randomUUID()): EventTag {
  return { id, name: "", type: "number", icon: DEFAULT_TAG_ICON, unit: "" };
}

export function validateEventInput(input: EventFormInput): string | null {
  if (!input.title.trim()) return "Title is required.";
  const names = input.tags.map((tag) => tag.name.trim().toLowerCase());
  if (names.some((name) => !name)) return "Every tag needs a name.";
  if (new Set(names).size !== names.length) return "Tag names must be unique.";
  if (input.tags.some((tag) => !TAG_TYPES.includes(tag.type))) {
    return "Unknown tag type.";
  }
  return null;
}

function normalizeTag(tag: EventTag): EventTag {
  return {
    ...tag,
    name: tag.name.trim(),
    unit: tag.type === "number" ? tag.unit.trim() : "",
  };
}

export function createTrackedEvent(
  input: EventFormInput,
  now: string,
  id: string = crypto.randomUUID(),
): TrackedEvent {
  return {
    id,
    title: input.title.trim(),
    description: input.description,
    status: input.status,
    tags: input.tags.map(normalizeTag),
    days: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Apply edited fields. Values of removed tags — and values whose type no longer fits a retyped
 * tag — are pruned so a day never shows data for a field the event no longer defines.
 */
export function updateTrackedEvent(
  existing: TrackedEvent,
  input: EventFormInput,
  now: string,
): TrackedEvent {
  const tags = input.tags.map(normalizeTag);
  const days = existing.days
    .map((day) => ({ ...day, tagValues: pruneTagValues(day.tagValues, tags) }))
    .filter((day) => !isDayEmpty(day));
  return {
    ...existing,
    title: input.title.trim(),
    description: input.description,
    status: input.status,
    tags,
    days,
    updatedAt: now,
  };
}

function pruneTagValues(
  values: Record<string, TagValue>,
  tags: EventTag[],
): Record<string, TagValue> {
  const next: Record<string, TagValue> = {};
  for (const tag of tags) {
    const value = values[tag.id];
    if (value !== undefined && valueFitsType(tag, value)) next[tag.id] = value;
  }
  return next;
}

function valueFitsType(tag: EventTag, value: TagValue): boolean {
  if (tag.type === "number") return typeof value === "number";
  if (tag.type === "boolean") return typeof value === "boolean";
  return typeof value === "string";
}

// ---------------------------------------------------------------------------------------------
// Tag values
// ---------------------------------------------------------------------------------------------

/** Parse raw input for a number/text tag; `undefined` clears the value. */
export function parseTagInput(
  tag: EventTag,
  raw: string,
): TagValue | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (tag.type === "number") {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return trimmed;
}

/** The text an input shows for a stored value (booleans are toggles, not inputs). */
export function tagInputValue(value: TagValue | undefined): string {
  return value === undefined || typeof value === "boolean" ? "" : String(value);
}

export function formatTagValue(tag: EventTag, value: TagValue): string {
  if (typeof value === "boolean") return value ? TRUE_LABEL : FALSE_LABEL;
  if (typeof value === "number") return `${value}${tag.unit}`;
  return value;
}

/** The event's tags that carry a value on this day, in tag order. */
export function trackedTagValues(
  event: TrackedEvent,
  day: EventDay,
): { tag: EventTag; value: TagValue }[] {
  return event.tags.flatMap((tag) => {
    const value = day.tagValues[tag.id];
    return value === undefined ? [] : [{ tag, value }];
  });
}

// ---------------------------------------------------------------------------------------------
// Days + items
// ---------------------------------------------------------------------------------------------

export function emptyDay(date: string): EventDay {
  return { date, tagValues: {}, items: [], note: "" };
}

export function dayFor(
  event: TrackedEvent,
  date: string,
): EventDay | undefined {
  return event.days.find((day) => day.date === date);
}

export function createEventItem(id: string = crypto.randomUUID()): EventItem {
  return { id, label: "", value: "", images: [] };
}

function isItemEmpty(item: EventItem): boolean {
  return !item.label.trim() && !item.value.trim() && item.images.length === 0;
}

export function isDayEmpty(day: EventDay): boolean {
  return (
    Object.keys(day.tagValues).length === 0 &&
    day.items.every(isItemEmpty) &&
    !day.note.trim() &&
    !day.milestone
  );
}

/** Drop blank item rows and trim text so stored days stay tidy. */
export function normalizeDay(day: EventDay): EventDay {
  return {
    date: day.date,
    tagValues: { ...day.tagValues },
    // Rebuilt field by field so keys from older drafts (e.g. a per-item flag) are not kept.
    items: day.items
      .filter((item) => !isItemEmpty(item))
      .map((item) => ({
        id: item.id,
        label: item.label.trim(),
        value: item.value.trim(),
        images: item.images,
      })),
    note: day.note.trim(),
    ...(day.milestone ? { milestone: true } : {}),
  };
}

/** Insert / replace a day (or remove it when nothing is tracked), keeping days sorted. */
export function upsertDay(
  event: TrackedEvent,
  day: EventDay,
  now: string,
): TrackedEvent {
  const normalized = normalizeDay(day);
  const others = event.days.filter((existing) => existing.date !== day.date);
  const days = isDayEmpty(normalized) ? others : [...others, normalized];
  days.sort((left, right) => left.date.localeCompare(right.date));
  return { ...event, days, updatedAt: now };
}

export function removeDay(
  event: TrackedEvent,
  date: string,
  now: string,
): TrackedEvent {
  return {
    ...event,
    days: event.days.filter((day) => day.date !== date),
    updatedAt: now,
  };
}

export function itemValidationError(day: EventDay): string | null {
  const unnamed = day.items.some(
    (item) => !isItemEmpty(item) && !item.label.trim(),
  );
  return unnamed ? "Every item needs a name." : null;
}

// ---------------------------------------------------------------------------------------------
// Calendar dates
// ---------------------------------------------------------------------------------------------

export function todayKey(now: Date = new Date()): string {
  return dateToDateInput(now);
}

function keyToDate(key: string): Date {
  return parseDateInput(key) ?? new Date(Number.NaN);
}

export function addDays(key: string, amount: number): string {
  const date = keyToDate(key);
  date.setDate(date.getDate() + amount);
  return dateToDateInput(date);
}

/** Whole calendar days from `from` to `to` (rounded so DST hours never skew the count). */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (keyToDate(to).getTime() - keyToDate(from).getTime()) / DAY_MS,
  );
}

export interface MonthCursor {
  year: number;
  /** 0-based like `Date#getMonth`. */
  month: number;
}

export function monthOf(key: string): MonthCursor {
  const date = keyToDate(key);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function shiftMonth(cursor: MonthCursor, amount: number): MonthCursor {
  const date = new Date(cursor.year, cursor.month + amount, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

/** Monday-first weeks covering the month, padded with neighbouring days. */
export function monthGrid(cursor: MonthCursor): string[][] {
  const first = new Date(cursor.year, cursor.month, 1);
  const leading = (first.getDay() + 6) % 7;
  const start = dateToDateInput(
    new Date(cursor.year, cursor.month, 1 - leading),
  );
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const weekCount = Math.ceil((leading + daysInMonth) / 7);
  return Array.from({ length: weekCount }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) =>
      addDays(start, week * 7 + weekday),
    ),
  );
}

export function isInMonth(key: string, cursor: MonthCursor): boolean {
  const { year, month } = monthOf(key);
  return year === cursor.year && month === cursor.month;
}

// ---------------------------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------------------------

/** `""` = everything; `tag:<id>` = one tag; `item:<label>` = items with that name. */
export type TimelineFilter = string;

const TAG_FILTER_PREFIX = "tag:";
const ITEM_FILTER_PREFIX = "item:";

export interface TimelineFilterOption {
  value: TimelineFilter;
  label: string;
}

function itemKey(label: string): string {
  return label.trim().toLowerCase();
}

export function timelineFilterOptions(
  event: TrackedEvent,
): TimelineFilterOption[] {
  const itemLabels = new Map<string, string>();
  for (const day of event.days) {
    for (const item of day.items) {
      if (!itemLabels.has(itemKey(item.label))) {
        itemLabels.set(itemKey(item.label), item.label);
      }
    }
  }
  return [
    { value: "", label: "Everything" },
    ...event.tags.map((tag) => ({
      value: `${TAG_FILTER_PREFIX}${tag.id}`,
      label: tag.name,
    })),
    ...[...itemLabels.entries()].map(([key, label]) => ({
      value: `${ITEM_FILTER_PREFIX}${key}`,
      label,
    })),
  ];
}

export interface TimelinePoint {
  date: string;
  tags: { tag: EventTag; value: TagValue }[];
  items: EventItem[];
  note: string;
}

/** The days to plot, narrowed to one tag or item name when a filter is set. */
export function timelinePoints(
  event: TrackedEvent,
  filter: TimelineFilter,
): TimelinePoint[] {
  const points = event.days.map((day) => ({
    date: day.date,
    tags: trackedTagValues(event, day),
    items: day.items,
    note: day.note,
  }));
  if (filter.startsWith(TAG_FILTER_PREFIX)) {
    const tagId = filter.slice(TAG_FILTER_PREFIX.length);
    return points
      .map((point) => ({
        ...point,
        tags: point.tags.filter(({ tag }) => tag.id === tagId),
        items: [],
        note: "",
      }))
      .filter((point) => point.tags.length > 0);
  }
  if (filter.startsWith(ITEM_FILTER_PREFIX)) {
    const key = filter.slice(ITEM_FILTER_PREFIX.length);
    return points
      .map((point) => ({
        ...point,
        tags: [],
        items: point.items.filter((item) => itemKey(item.label) === key),
        note: "",
      }))
      .filter((point) => point.items.length > 0);
  }
  return points;
}

export const TIMELINE_MIN_PX_PER_DAY = 2;
export const TIMELINE_MAX_PX_PER_DAY = 240;
export const TIMELINE_DEFAULT_PX_PER_DAY = 48;

export function clampZoom(pxPerDay: number): number {
  return Math.min(
    TIMELINE_MAX_PX_PER_DAY,
    Math.max(TIMELINE_MIN_PX_PER_DAY, pxPerDay),
  );
}

/**
 * Horizontal timeline camera. `startDay` is the (fractional) day offset from `anchor` drawn at the
 * left edge, so panning by a few pixels never has to round to whole days.
 */
export interface TimelineViewport {
  anchor: string;
  startDay: number;
  pxPerDay: number;
}

/** Fit `[first, last]` into `width` pixels, keeping `edgePx` clear on both sides for labels. */
export function fitViewport(
  first: string,
  last: string,
  width: number,
  edgePx: number,
): TimelineViewport {
  const days = daysBetween(first, last) + 1;
  const pxPerDay = clampZoom(Math.max(width - edgePx * 2, 1) / days);
  // Centre the range; when the zoom clamps, the slack is split evenly.
  const startDay = (days - width / pxPerDay) / 2;
  return { anchor: first, startDay, pxPerDay };
}

/** Viewport centred on `date`. */
export function centerViewport(
  date: string,
  width: number,
  pxPerDay: number,
): TimelineViewport {
  return { anchor: date, startDay: 0.5 - width / pxPerDay / 2, pxPerDay };
}

/** Left edge (px) of `date`'s day column. */
export function dateX(viewport: TimelineViewport, date: string): number {
  return (
    (daysBetween(viewport.anchor, date) - viewport.startDay) * viewport.pxPerDay
  );
}

/** First and last calendar days at least partly inside `width`. */
export function visibleRange(
  viewport: TimelineViewport,
  width: number,
): { from: string; to: string } {
  return {
    from: addDays(viewport.anchor, Math.floor(viewport.startDay)),
    to: addDays(
      viewport.anchor,
      Math.ceil(viewport.startDay + width / viewport.pxPerDay),
    ),
  };
}

export function panViewport(
  viewport: TimelineViewport,
  deltaPx: number,
): TimelineViewport {
  return {
    ...viewport,
    startDay: viewport.startDay - deltaPx / viewport.pxPerDay,
  };
}

/** Zoom by `factor`, keeping the day under `focusX` pinned in place. */
export function zoomViewport(
  viewport: TimelineViewport,
  factor: number,
  focusX: number,
): TimelineViewport {
  const focusDay = viewport.startDay + focusX / viewport.pxPerDay;
  const pxPerDay = clampZoom(viewport.pxPerDay * factor);
  return { ...viewport, pxPerDay, startDay: focusDay - focusX / pxPerDay };
}

export type TickUnit = "day" | "month";

/** Day labels once there is room for them; month labels otherwise. */
export function tickUnit(pxPerDay: number): TickUnit {
  return pxPerDay >= 28 ? "day" : "month";
}

/** Tick dates in `[from, to]` for the given unit. */
export function timelineTicks(
  from: string,
  to: string,
  unit: TickUnit,
): string[] {
  if (unit === "day") {
    const count = Math.max(0, daysBetween(from, to));
    return Array.from({ length: count + 1 }, (_, index) =>
      addDays(from, index),
    );
  }
  const start = keyToDate(from);
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const ticks: string[] = [];
  while (dateToDateInput(cursor) <= to) {
    const key = dateToDateInput(cursor);
    if (key >= from) ticks.push(key);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return ticks;
}

// ---------------------------------------------------------------------------------------------
// Trending
// ---------------------------------------------------------------------------------------------

export function numericTags(event: TrackedEvent): EventTag[] {
  return event.tags.filter((tag) => tag.type === "number");
}

export interface TrendPoint {
  date: string;
  value: number;
}

/** One numeric tag's values over time, in date order. */
export function trendSeries(event: TrackedEvent, tagId: string): TrendPoint[] {
  return event.days.flatMap((day) => {
    const value = day.tagValues[tagId];
    return typeof value === "number" ? [{ date: day.date, value }] : [];
  });
}

export interface TrendSummary {
  /** Last value minus first. */
  change: number;
  min: number;
  max: number;
}

export function trendSummary(points: TrendPoint[]): TrendSummary | null {
  if (points.length === 0) return null;
  const values = points.map((point) => point.value);
  return {
    change: values[values.length - 1] - values[0],
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

const NICE_STEPS = [1, 2, 2.5, 5, 10];

/**
 * Round `[min, max]` out to ~`target` evenly spaced, human-friendly ticks (1/2/2.5/5 × 10ⁿ).
 * A flat series is padded so it still gets a visible range.
 */
export function niceTicks(min: number, max: number, target = 5): number[] {
  const [low, high] = min === max ? [min - 1, max + 1] : [min, max];
  const rough = (high - low) / Math.max(1, target - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    magnitude * NICE_STEPS.find((nice) => nice * magnitude >= rough)!;
  const start = Math.floor(low / step) * step;
  const end = Math.ceil(high / step) * step;
  const count = Math.round((end - start) / step);
  // Round away float noise (0.1 + 0.2) so labels print cleanly.
  return Array.from({ length: count + 1 }, (_, index) =>
    Number((start + index * step).toFixed(10)),
  );
}

/** Up to `count` date labels spread evenly across `[first, last]`. */
export function dateTicks(
  first: string,
  last: string,
  count: number,
): string[] {
  const span = daysBetween(first, last);
  if (span === 0) return [first];
  const steps = Math.max(1, Math.min(count - 1, span));
  return [
    ...new Set(
      Array.from({ length: steps + 1 }, (_, index) =>
        addDays(first, Math.round((index * span) / steps)),
      ),
    ),
  ];
}

export interface DateRange {
  from: string;
  to: string;
}

/** From the event's first tracked day to today (or its last day, if that is later). */
export function defaultTrendRange(
  event: TrackedEvent,
  today: string,
): DateRange {
  const range = eventDateRange(event);
  if (!range) return { from: today, to: today };
  return {
    from: range.first < today ? range.first : today,
    to: range.last > today ? range.last : today,
  };
}

/** Move the other end when one end crosses it, so the range never inverts. */
export function setRangeEnd(
  range: DateRange,
  end: keyof DateRange,
  date: string,
): DateRange {
  if (end === "from")
    return { from: date, to: date > range.to ? date : range.to };
  return { from: date < range.from ? date : range.from, to: date };
}

export function pointsInRange(
  points: TrendPoint[],
  range: DateRange,
): TrendPoint[] {
  return points.filter(
    (point) => point.date >= range.from && point.date <= range.to,
  );
}

/** Shift by whole calendar months, clamping to the month's last day (May 31 − 3 → Feb 28). */
export function addMonths(key: string, amount: number): string {
  const date = keyToDate(key);
  const target = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return dateToDateInput(target);
}

export const RANGE_PRESETS = [
  { id: "3m", label: "最近三个月", months: 3 },
  { id: "6m", label: "最近半年", months: 6 },
  { id: "12m", label: "最近一年", months: 12 },
] as const;
export type RangePresetId = (typeof RANGE_PRESETS)[number]["id"];

export function presetRange(id: RangePresetId, today: string): DateRange {
  const preset = RANGE_PRESETS.find((candidate) => candidate.id === id)!;
  return { from: addMonths(today, -preset.months), to: today };
}

/** A whole calendar year; the current year ends today rather than in the future. */
export function yearRange(year: number, today: string): DateRange {
  const end = `${year}-12-31`;
  return { from: `${year}-01-01`, to: end > today ? today : end };
}

/** Years from the event's first tracked day to today, newest first. */
export function eventYears(event: TrackedEvent, today: string): number[] {
  const current = Number(today.slice(0, 4));
  const first = Number((eventDateRange(event)?.first ?? today).slice(0, 4));
  return Array.from(
    { length: Math.max(0, current - first) + 1 },
    (_, index) => current - index,
  );
}

export function sameRange(left: DateRange, right: DateRange): boolean {
  return left.from === right.from && left.to === right.to;
}

/**
 * Whole calendar months covered by the range, split into years + months. Both ends count, so
 * Jan 1 – Dec 31 is a full year rather than 11 months.
 */
export function timeSpan(range: DateRange): { years: number; months: number } {
  const [fromYear, fromMonth, fromDay] = range.from.split("-").map(Number);
  const [toYear, toMonth, toDay] = addDays(range.to, 1).split("-").map(Number);
  const total = Math.max(
    0,
    (toYear - fromYear) * 12 +
      (toMonth - fromMonth) -
      (toDay < fromDay ? 1 : 0),
  );
  return { years: Math.floor(total / 12), months: total % 12 };
}

/** `3年3个月`, `2年`, `10个月`; zero parts are dropped (under a month reads `0个月`). */
export function formatTimeSpan(range: DateRange): string {
  const { years, months } = timeSpan(range);
  if (years === 0) return `${months}个月`;
  return months === 0 ? `${years}年` : `${years}年${months}个月`;
}
