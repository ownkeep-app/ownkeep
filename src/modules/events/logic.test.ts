import { describe, expect, it, onTestFinished } from "vitest";

import { useI18nStore } from "@/i18n";

import {
  addDays,
  addMonths,
  buildEventIndex,
  centerViewport,
  clampZoom,
  createEventItem,
  createTag,
  createTrackedEvent,
  dateTicks,
  defaultTrendRange,
  dateX,
  dayFor,
  daysBetween,
  emptyDay,
  emptyEventForm,
  eventYears,
  eventDateRange,
  fitViewport,
  formatTagValue,
  formatTimeSpan,
  importantFirst,
  formFromEvent,
  isDayEmpty,
  isInMonth,
  isTrackedEvent,
  itemValidationError,
  monthGrid,
  monthOf,
  niceTicks,
  normalizeDay,
  numericTags,
  panViewport,
  pointsInRange,
  presetRange,
  removeDay,
  parseTagInput,
  sameRange,
  setRangeEnd,
  shiftMonth,
  sortEvents,
  tagInputValue,
  tickUnit,
  timeSpan,
  timelineFilterOptions,
  timelinePoints,
  timelineTicks,
  todayKey,
  trackedEvents,
  trackedTagValues,
  trendSeries,
  trendSummary,
  updateTrackedEvent,
  upsertDay,
  validateEventInput,
  visibleRange,
  yearRange,
  zoomViewport,
  TIMELINE_MAX_PX_PER_DAY,
  TIMELINE_MIN_PX_PER_DAY,
} from "./logic";
import type { EventTag, TrackedEvent } from "./types";

const NOW = "2026-11-01T08:00:00.000Z";

const pills: EventTag = {
  id: "pills",
  name: "安眠药",
  type: "number",
  icon: "pill",
  unit: "",
};
const sleep: EventTag = {
  id: "sleep",
  name: "睡眠时长",
  type: "number",
  icon: "moon",
  unit: "h",
};
const dreams: EventTag = {
  id: "dreams",
  name: "多梦",
  type: "boolean",
  icon: "brain",
  unit: "",
};
const mood: EventTag = {
  id: "mood",
  name: "Mood",
  type: "text",
  icon: "smile",
  unit: "",
};

function makeEvent(overrides: Partial<TrackedEvent> = {}): TrackedEvent {
  return {
    id: "event-1",
    title: "Sleeping of My Wife",
    description: "Track sleep",
    status: "open",
    tags: [pills, sleep, dreams, mood],
    days: [
      {
        date: "2026-10-30",
        tagValues: { pills: 1, sleep: 7.5, dreams: true },
        items: [{ id: "i1", label: "Height", value: "147.2 cm", images: [] }],
        note: "restless",
      },
      {
        date: "2026-11-01",
        tagValues: { sleep: 8, mood: "calm" },
        items: [{ id: "i2", label: "height", value: "147.4 cm", images: [] }],
        note: "",
      },
    ],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-31T00:00:00.000Z",
    ...overrides,
  };
}

describe("guards", () => {
  it("accepts well-formed events and rejects malformed ones", () => {
    expect(isTrackedEvent(makeEvent())).toBe(true);
    expect(isTrackedEvent(null)).toBe(false);
    expect(isTrackedEvent("event")).toBe(false);
    expect(isTrackedEvent({ ...makeEvent(), status: "archived" })).toBe(false);
    expect(isTrackedEvent({ ...makeEvent(), days: {} })).toBe(false);
    expect(trackedEvents([makeEvent(), { id: 1 }])).toHaveLength(1);
  });
});

describe("index + ordering", () => {
  it("indexes title, description, tag names, items and notes", () => {
    const [entry] = buildEventIndex([makeEvent()]);
    expect(entry).toEqual(
      expect.objectContaining({
        id: "event-1",
        moduleId: "events",
        type: "event",
        displayLine: "Sleeping of My Wife — Open",
      }),
    );
    for (const term of [
      "Track sleep",
      "安眠药",
      "Height",
      "147.2 cm",
      "restless",
    ]) {
      expect(entry.searchString).toContain(term);
    }
  });

  it("sorts by status, then most recently updated, then title", () => {
    const sorted = sortEvents([
      makeEvent({ id: "closed", status: "closed" }),
      makeEvent({ id: "old", updatedAt: "2026-01-01T00:00:00.000Z" }),
      makeEvent({ id: "b", title: "B" }),
      makeEvent({ id: "a", title: "A" }),
      makeEvent({ id: "paused", status: "paused" }),
    ]);
    expect(sorted.map((event) => event.id)).toEqual([
      "a",
      "b",
      "old",
      "paused",
      "closed",
    ]);
  });

  it("reports the tracked date range", () => {
    expect(eventDateRange(makeEvent())).toEqual({
      first: "2026-10-30",
      last: "2026-11-01",
    });
    expect(eventDateRange(makeEvent({ days: [] }))).toBeNull();
  });
});

describe("event form", () => {
  it("round-trips form input and creates trimmed events", () => {
    expect(emptyEventForm()).toEqual({
      title: "",
      description: "",
      status: "open",
      tags: [],
    });
    const form = formFromEvent(makeEvent());
    expect(form.tags).toEqual(makeEvent().tags);
    expect(form.tags[0]).not.toBe(makeEvent().tags[0]);

    const created = createTrackedEvent(
      {
        title: "  Height  ",
        description: "Growth",
        status: "open",
        tags: [
          { ...createTag("t"), name: " Weight ", unit: " kg " },
          { ...dreams, unit: "x" },
        ],
      },
      NOW,
      "new-id",
    );
    expect(created).toEqual({
      id: "new-id",
      title: "Height",
      description: "Growth",
      status: "open",
      tags: [
        { id: "t", name: "Weight", type: "number", icon: "tag", unit: "kg" },
        { ...dreams, unit: "" },
      ],
      days: [],
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(createTrackedEvent(emptyEventForm(), NOW).id).toEqual(
      expect.any(String),
    );
    expect(createTag().id).toEqual(expect.any(String));
  });

  it("validates title and tag names", () => {
    const valid = { ...emptyEventForm(), title: "Sleep", tags: [pills] };
    expect(validateEventInput(valid)).toBeNull();
    expect(validateEventInput({ ...valid, title: " " })).toBe(
      "Title is required.",
    );
    expect(
      validateEventInput({ ...valid, tags: [{ ...pills, name: "" }] }),
    ).toBe("Every tag needs a name.");
    expect(
      validateEventInput({
        ...valid,
        tags: [pills, { ...pills, id: "x", name: " 安眠药 " }],
      }),
    ).toBe("Tag names must be unique.");
    expect(
      validateEventInput({
        ...valid,
        tags: [{ ...pills, type: "date" as EventTag["type"] }],
      }),
    ).toBe("Unknown tag type.");
  });

  it("prunes values of removed or retyped tags and drops days left empty", () => {
    const event = makeEvent({
      days: [
        ...makeEvent().days,
        { date: "2026-11-02", tagValues: { pills: 2 }, items: [], note: "" },
      ],
    });
    const updated = updateTrackedEvent(
      event,
      {
        title: " Sleep ",
        description: "new",
        status: "closed",
        tags: [sleep, { ...dreams, type: "text" }, mood],
      },
      NOW,
    );
    expect(updated.title).toBe("Sleep");
    expect(updated.status).toBe("closed");
    expect(updated.updatedAt).toBe(NOW);
    expect(updated.days.map((day) => day.date)).toEqual([
      "2026-10-30",
      "2026-11-01",
    ]);
    expect(updated.days[0].tagValues).toEqual({ sleep: 7.5 });
    expect(updated.days[1].tagValues).toEqual({ sleep: 8, mood: "calm" });
  });
});

describe("tag values", () => {
  it("parses raw input by tag type", () => {
    expect(parseTagInput(pills, " 1 ")).toBe(1);
    expect(parseTagInput(sleep, "7.5")).toBe(7.5);
    expect(parseTagInput(sleep, "eight")).toBeUndefined();
    expect(parseTagInput(sleep, "  ")).toBeUndefined();
    expect(parseTagInput(mood, " calm ")).toBe("calm");
  });

  it("formats values for display and inputs", () => {
    expect(formatTagValue(sleep, 8)).toBe("8h");
    expect(formatTagValue(dreams, true)).toBe("Y");
    expect(formatTagValue(dreams, false)).toBe("N");
    expect(formatTagValue(mood, "calm")).toBe("calm");
    expect(tagInputValue(undefined)).toBe("");
    expect(tagInputValue(true)).toBe("");
    expect(tagInputValue(7.5)).toBe("7.5");
  });

  it("lists tracked tag values in tag order", () => {
    const event = makeEvent();
    expect(
      trackedTagValues(event, event.days[0]).map(({ tag }) => tag.id),
    ).toEqual(["pills", "sleep", "dreams"]);
  });
});

describe("days", () => {
  it("finds, normalizes and validates days", () => {
    const event = makeEvent();
    expect(dayFor(event, "2026-11-01")?.tagValues.sleep).toBe(8);
    expect(dayFor(event, "2026-01-01")).toBeUndefined();
    expect(isDayEmpty(emptyDay("2026-11-05"))).toBe(true);
    expect(isDayEmpty({ ...emptyDay("2026-11-05"), note: " x " })).toBe(false);
    expect(createEventItem("i").images).toEqual([]);
    expect(createEventItem().id).toEqual(expect.any(String));

    const normalized = normalizeDay({
      date: "2026-11-05",
      tagValues: { pills: 1 },
      items: [
        createEventItem("blank"),
        { id: "i", label: " Weight ", value: " 37 kg ", images: [] },
      ],
      note: "  ok ",
    });
    expect(normalized.items).toEqual([
      { id: "i", label: "Weight", value: "37 kg", images: [] },
    ]);
    expect(normalized.note).toBe("ok");

    expect(
      itemValidationError({
        ...emptyDay("d"),
        items: [
          { id: "x", label: " ", value: "37", images: [] },
          createEventItem("blank"),
        ],
      }),
    ).toBe("Every item needs a name.");
    expect(
      itemValidationError({
        ...emptyDay("d"),
        items: [createEventItem("blank")],
      }),
    ).toBeNull();
  });

  it("upserts days in date order and removes days with nothing tracked", () => {
    const event = makeEvent();
    const added = upsertDay(
      event,
      { ...emptyDay("2026-10-31"), tagValues: { pills: 0 } },
      NOW,
    );
    expect(added.days.map((day) => day.date)).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
    expect(added.updatedAt).toBe(NOW);

    const replaced = upsertDay(
      added,
      { ...emptyDay("2026-10-31"), note: "late" },
      NOW,
    );
    expect(dayFor(replaced, "2026-10-31")).toEqual({
      ...emptyDay("2026-10-31"),
      note: "late",
    });

    const cleared = upsertDay(replaced, emptyDay("2026-10-31"), NOW);
    expect(cleared.days.map((day) => day.date)).toEqual([
      "2026-10-30",
      "2026-11-01",
    ]);
  });
});

describe("milestones", () => {
  it("keeps a milestone-only day and stores the flag only when set", () => {
    const flagged = { ...emptyDay("2026-11-05"), milestone: true };
    expect(isDayEmpty(flagged)).toBe(false);
    expect(normalizeDay(flagged)).toEqual({
      ...emptyDay("2026-11-05"),
      milestone: true,
    });
    expect(normalizeDay({ ...flagged, milestone: false })).toEqual(
      emptyDay("2026-11-05"),
    );

    const event = upsertDay(makeEvent({ days: [] }), flagged, NOW);
    expect(dayFor(event, "2026-11-05")?.milestone).toBe(true);
    expect(upsertDay(event, emptyDay("2026-11-05"), NOW).days).toEqual([]);
  });

  it("drops keys that are not part of an item", () => {
    const legacy = {
      id: "i",
      label: "Height",
      value: "147",
      images: [],
      milestone: true,
    };
    expect(normalizeDay({ ...emptyDay("d"), items: [legacy] }).items).toEqual([
      { id: "i", label: "Height", value: "147", images: [] },
    ]);
  });
});

describe("calendar dates", () => {
  it("does day arithmetic across month and DST boundaries", () => {
    expect(todayKey(new Date(2026, 10, 1, 23, 30))).toBe("2026-11-01");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
    expect(daysBetween("2026-11-01", "2026-10-25")).toBe(-7);
  });

  it("moves month cursors and builds Monday-first grids", () => {
    expect(monthOf("2026-11-01")).toEqual({ year: 2026, month: 10 });
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({
      year: 2027,
      month: 0,
    });
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({
      year: 2025,
      month: 11,
    });

    // Nov 2026 starts on a Sunday → six Monday-first rows.
    const november = monthGrid({ year: 2026, month: 10 });
    expect(november).toHaveLength(6);
    expect(november[0][0]).toBe("2026-10-26");
    expect(november[0][6]).toBe("2026-11-01");
    expect(november[5][6]).toBe("2026-12-06");

    // Feb 2027 starts on a Monday and has 28 days → exactly four rows.
    const february = monthGrid({ year: 2027, month: 1 });
    expect(february).toHaveLength(4);
    expect(february[0][0]).toBe("2027-02-01");

    expect(isInMonth("2026-11-30", { year: 2026, month: 10 })).toBe(true);
    expect(isInMonth("2026-10-31", { year: 2026, month: 10 })).toBe(false);
  });
});

describe("timeline", () => {
  it("offers tag and distinct item filters", () => {
    expect(timelineFilterOptions(makeEvent())).toEqual([
      { value: "", label: "Everything" },
      { value: "tag:pills", label: "安眠药" },
      { value: "tag:sleep", label: "睡眠时长" },
      { value: "tag:dreams", label: "多梦" },
      { value: "tag:mood", label: "Mood" },
      { value: "item:height", label: "Height" },
    ]);
  });

  it("narrows points to one tag or item name", () => {
    const event = makeEvent();
    expect(timelinePoints(event, "")).toHaveLength(2);

    const pillPoints = timelinePoints(event, "tag:pills");
    expect(pillPoints).toHaveLength(1);
    expect(pillPoints[0]).toEqual(
      expect.objectContaining({ date: "2026-10-30", items: [], note: "" }),
    );
    expect(pillPoints[0].tags.map(({ tag }) => tag.id)).toEqual(["pills"]);

    const heightPoints = timelinePoints(event, "item:height");
    expect(heightPoints.map((point) => point.items[0].value)).toEqual([
      "147.2 cm",
      "147.4 cm",
    ]);
    expect(heightPoints[0].tags).toEqual([]);
    expect(timelinePoints(event, "item:weight")).toEqual([]);
  });

  it("clamps zoom", () => {
    expect(clampZoom(0)).toBe(TIMELINE_MIN_PX_PER_DAY);
    expect(clampZoom(10_000)).toBe(TIMELINE_MAX_PX_PER_DAY);
    expect(clampZoom(30)).toBe(30);
  });

  it("fits a range with edge room and centres a date", () => {
    const fit = fitViewport("2026-10-01", "2026-10-10", 1000, 100);
    expect(fit.pxPerDay).toBe(80);
    expect(dateX(fit, "2026-10-01")).toBeCloseTo(100);
    expect(dateX(fit, "2026-10-11")).toBeCloseTo(900);

    // A single day clamps to max zoom and stays centred.
    const single = fitViewport("2026-10-01", "2026-10-01", 1000, 100);
    expect(single.pxPerDay).toBe(TIMELINE_MAX_PX_PER_DAY);
    expect(dateX(single, "2026-10-01") + single.pxPerDay / 2).toBeCloseTo(500);

    const centered = centerViewport("2026-11-01", 800, 40);
    expect(dateX(centered, "2026-11-01") + 20).toBeCloseTo(400);
  });

  it("pans, zooms around a focus point, and reports the visible range", () => {
    const viewport = { anchor: "2026-11-01", startDay: 0, pxPerDay: 50 };
    expect(panViewport(viewport, 25).startDay).toBeCloseTo(-0.5);

    const zoomed = zoomViewport(viewport, 2, 200);
    expect(zoomed.pxPerDay).toBe(100);
    // The day under x=200 (day 4) is still under x=200.
    expect(dateX(zoomed, "2026-11-05")).toBeCloseTo(200);

    expect(visibleRange({ ...viewport, startDay: -0.5 }, 200)).toEqual({
      from: "2026-10-31",
      to: "2026-11-05",
    });
  });

  it("chooses tick units and lists ticks", () => {
    expect(tickUnit(40)).toBe("day");
    expect(tickUnit(10)).toBe("month");
    expect(timelineTicks("2026-10-30", "2026-11-02", "day")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    expect(timelineTicks("2026-11-02", "2026-11-01", "day")).toEqual([
      "2026-11-02",
    ]);
    expect(timelineTicks("2026-10-15", "2027-01-01", "month")).toEqual([
      "2026-11-01",
      "2026-12-01",
      "2027-01-01",
    ]);
    expect(timelineTicks("2026-11-01", "2026-11-20", "month")).toEqual([
      "2026-11-01",
    ]);
  });
});

describe("trending", () => {
  it("picks numeric tags and their values in date order", () => {
    const event = makeEvent();
    expect(numericTags(event).map((tag) => tag.id)).toEqual(["pills", "sleep"]);
    expect(trendSeries(event, "sleep")).toEqual([
      { date: "2026-10-30", value: 7.5 },
      { date: "2026-11-01", value: 8 },
    ]);
    expect(trendSeries(event, "pills")).toEqual([
      { date: "2026-10-30", value: 1 },
    ]);
    expect(trendSeries(event, "dreams")).toEqual([]);
  });

  it("summarises latest, change, min and max", () => {
    expect(trendSummary([])).toBeNull();
    expect(
      trendSummary([
        { date: "a", value: 147.2 },
        { date: "b", value: 146 },
        { date: "c", value: 148.1 },
      ]),
    ).toEqual({
      change: expect.closeTo(0.9),
      min: 146,
      max: 148.1,
    });
  });

  it("rounds axis ticks to friendly steps", () => {
    expect(niceTicks(0, 9.3)).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(niceTicks(146, 148.1)).toEqual([146, 147, 148, 149]);
    expect(niceTicks(0.1, 0.3)).toEqual([0.1, 0.15, 0.2, 0.25, 0.3]);
    expect(niceTicks(8, 8)).toEqual([7, 7.5, 8, 8.5, 9]);
    expect(niceTicks(-3, 4)).toEqual([-4, -2, 0, 2, 4]);
  });

  it("spreads date ticks across the range", () => {
    expect(dateTicks("2026-11-01", "2026-11-01", 6)).toEqual(["2026-11-01"]);
    expect(dateTicks("2026-11-01", "2026-11-03", 6)).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
    ]);
    const spread = dateTicks("2026-01-01", "2026-12-31", 6);
    expect(spread).toHaveLength(6);
    expect(spread[0]).toBe("2026-01-01");
    expect(spread[5]).toBe("2026-12-31");
  });
});

describe("trend date range", () => {
  it("defaults from the first tracked day to today", () => {
    expect(defaultTrendRange(makeEvent(), "2026-11-20")).toEqual({
      from: "2026-10-30",
      to: "2026-11-20",
    });
    // Days logged ahead of today stay in range; an empty event is just today.
    expect(defaultTrendRange(makeEvent(), "2026-10-31")).toEqual({
      from: "2026-10-30",
      to: "2026-11-01",
    });
    expect(defaultTrendRange(makeEvent(), "2026-10-01")).toEqual({
      from: "2026-10-01",
      to: "2026-11-01",
    });
    expect(defaultTrendRange(makeEvent({ days: [] }), "2026-11-20")).toEqual({
      from: "2026-11-20",
      to: "2026-11-20",
    });
  });

  it("never lets the range invert", () => {
    const range = { from: "2026-10-01", to: "2026-10-31" };
    expect(setRangeEnd(range, "from", "2026-10-10")).toEqual({
      from: "2026-10-10",
      to: "2026-10-31",
    });
    expect(setRangeEnd(range, "from", "2026-11-05")).toEqual({
      from: "2026-11-05",
      to: "2026-11-05",
    });
    expect(setRangeEnd(range, "to", "2026-10-20")).toEqual({
      from: "2026-10-01",
      to: "2026-10-20",
    });
    expect(setRangeEnd(range, "to", "2026-09-01")).toEqual({
      from: "2026-09-01",
      to: "2026-09-01",
    });
  });

  it("keeps points inside the range, inclusive", () => {
    const points = [
      { date: "2026-10-01", value: 1 },
      { date: "2026-10-15", value: 2 },
      { date: "2026-10-31", value: 3 },
    ];
    expect(
      pointsInRange(points, { from: "2026-10-01", to: "2026-10-15" }),
    ).toEqual(points.slice(0, 2));
    expect(
      pointsInRange(points, { from: "2026-11-01", to: "2026-11-30" }),
    ).toEqual([]);
  });
});

describe("quick ranges and time span", () => {
  it("shifts by calendar months, clamping month ends", () => {
    expect(addMonths("2026-11-02", -3)).toBe("2026-08-02");
    expect(addMonths("2026-05-31", -3)).toBe("2026-02-28");
    expect(addMonths("2024-05-31", -3)).toBe("2024-02-29");
    expect(addMonths("2026-01-15", -12)).toBe("2025-01-15");
    expect(addMonths("2026-12-31", 2)).toBe("2027-02-28");
  });

  it("builds preset and year ranges ending today", () => {
    expect(presetRange("1m", "2026-11-02")).toEqual({
      from: "2026-10-02",
      to: "2026-11-02",
    });
    expect(presetRange("3m", "2026-11-02")).toEqual({
      from: "2026-08-02",
      to: "2026-11-02",
    });
    expect(presetRange("6m", "2026-11-02")).toEqual({
      from: "2026-05-02",
      to: "2026-11-02",
    });
    expect(presetRange("12m", "2026-11-02")).toEqual({
      from: "2025-11-02",
      to: "2026-11-02",
    });
    expect(yearRange(2025, "2026-11-02")).toEqual({
      from: "2025-01-01",
      to: "2025-12-31",
    });
    expect(yearRange(2026, "2026-11-02")).toEqual({
      from: "2026-01-01",
      to: "2026-11-02",
    });
    expect(sameRange({ from: "a", to: "b" }, { from: "a", to: "b" })).toBe(
      true,
    );
    expect(sameRange({ from: "a", to: "b" }, { from: "a", to: "c" })).toBe(
      false,
    );
  });

  it("lists years from the first tracked day to today, newest first", () => {
    expect(eventYears(makeEvent(), "2028-01-01")).toEqual([2028, 2027, 2026]);
    expect(eventYears(makeEvent({ days: [] }), "2026-11-02")).toEqual([2026]);
  });

  it("formats a time span in English by default", () => {
    expect(formatTimeSpan({ from: "2022-07-21", to: "2026-11-02" })).toBe(
      "4 years 3 months",
    );
    expect(formatTimeSpan({ from: "2025-11-02", to: "2026-11-02" })).toBe(
      "1 year",
    );
    expect(formatTimeSpan({ from: "2026-02-01", to: "2026-02-28" })).toBe(
      "1 month",
    );
  });

  it("measures whole months between the range ends", () => {
    useI18nStore.getState().setLanguage("zh-CN");
    onTestFinished(() => useI18nStore.getState().setLanguage("system"));
    expect(timeSpan({ from: "2022-07-21", to: "2026-11-02" })).toEqual({
      years: 4,
      months: 3,
    });
    expect(formatTimeSpan({ from: "2022-07-21", to: "2026-11-02" })).toBe(
      "4年3个月",
    );
    expect(formatTimeSpan({ from: "2026-01-01", to: "2026-11-02" })).toBe(
      "10个月",
    );
    expect(formatTimeSpan({ from: "2025-11-02", to: "2026-11-02" })).toBe(
      "1年",
    );
    expect(formatTimeSpan({ from: "2026-10-20", to: "2026-11-02" })).toBe(
      "0个月",
    );
    expect(formatTimeSpan({ from: "2026-11-02", to: "2026-11-02" })).toBe(
      "0个月",
    );
    // Both ends count: a calendar year or month is whole.
    expect(formatTimeSpan({ from: "2024-01-01", to: "2024-12-31" })).toBe(
      "1年",
    );
    expect(formatTimeSpan({ from: "2026-02-01", to: "2026-02-28" })).toBe(
      "1个月",
    );
    expect(formatTimeSpan({ from: "2024-01-01", to: "2025-06-30" })).toBe(
      "1年6个月",
    );
  });
});

describe("removeDay", () => {
  it("drops just that day and stamps the event", () => {
    const event = makeEvent();
    const removed = removeDay(event, "2026-10-30", NOW);
    expect(removed.days.map((day) => day.date)).toEqual(["2026-11-01"]);
    expect(removed.updatedAt).toBe(NOW);
    expect(removeDay(event, "2020-01-01", NOW).days).toHaveLength(2);
  });
});

describe("important tags", () => {
  it("stores the flag only when set and lists important tags first", () => {
    const created = createTrackedEvent(
      {
        ...emptyEventForm(),
        title: "Sleep",
        tags: [
          { ...pills, important: false },
          { ...sleep, important: true },
          { ...dreams, important: true },
        ],
      },
      NOW,
    );
    expect(created.tags[0]).toEqual(pills);
    expect(created.tags[1]).toEqual({ ...sleep, important: true });

    const event = makeEvent({ tags: created.tags });
    const ordered = importantFirst(trackedTagValues(event, event.days[0]));
    expect(ordered.map(({ tag }) => tag.id)).toEqual([
      "sleep",
      "dreams",
      "pills",
    ]);
  });
});
