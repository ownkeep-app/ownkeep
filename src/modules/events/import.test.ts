import { describe, expect, it } from "vitest";

import { planCsvImport } from "./import";
import type { TrackedEvent } from "./types";

const NOW = "2026-11-02T00:00:00.000Z";

const event: TrackedEvent = {
  id: "growth",
  title: "堂堂生长发育",
  description: "",
  status: "open",
  tags: [
    { id: "h", name: "身高", type: "number", icon: "ruler", unit: "厘米" },
    { id: "w", name: "体重", type: "number", icon: "weight", unit: "斤" },
    { id: "s", name: "Swim", type: "boolean", icon: "activity", unit: "" },
  ],
  days: [
    {
      date: "2026-10-27",
      tagValues: { h: 148 },
      items: [],
      note: "睡前",
      milestone: false,
    },
  ],
  createdAt: "2026-09-30T00:00:00.000Z",
  updatedAt: "2026-10-27T00:00:00.000Z",
};

let ids = 0;
const nextId = () => `new-${(ids += 1)}`;

describe("planCsvImport", () => {
  it("merges rows into days by tag name, case-insensitively", () => {
    const plan = planCsvImport(
      event,
      [
        "Date,身高,体重,swim,Note,Milestone",
        "2022-08-24,122.5,46,Y,游泳,",
        "2022/8/21,122.4,,n,开始吃河南的药,Y",
        "2026-10-27,148.1,,,睡前,",
      ].join("\n"),
      NOW,
      nextId,
    );

    expect(plan.issues).toEqual([]);
    expect(plan.newTags).toEqual([]);
    expect([plan.added, plan.updated]).toEqual([2, 1]);
    expect(plan.event.updatedAt).toBe(NOW);
    expect(plan.event.days.map((day) => day.date)).toEqual([
      "2022-08-21",
      "2022-08-24",
      "2026-10-27",
    ]);
    expect(plan.event.days[0]).toEqual({
      date: "2022-08-21",
      tagValues: { h: 122.4, s: false },
      items: [],
      note: "开始吃河南的药",
      milestone: true,
    });
    expect(plan.event.days[1].tagValues).toEqual({ h: 122.5, w: 46, s: true });
    expect(plan.event.days[1].milestone).toBeUndefined();
    // Existing day: value overwritten, identical note not duplicated.
    expect(plan.event.days[2]).toEqual(
      expect.objectContaining({ tagValues: { h: 148.1 }, note: "睡前" }),
    );
    // The source event is untouched until the plan is saved.
    expect(event.days).toHaveLength(1);
  });

  it("appends new notes, keeps milestones, and merges repeated dates", () => {
    const flagged = {
      ...event,
      days: [{ ...event.days[0], milestone: true }],
    };
    const plan = planCsvImport(
      flagged,
      "date,身高,note,milestone\n2026-10-27,,复查,N\n2026-10-27,148.2,再量,\n",
      NOW,
      nextId,
    );
    expect(plan.event.days).toEqual([
      {
        date: "2026-10-27",
        tagValues: { h: 148.2 },
        items: [],
        note: "睡前\n复查\n再量",
        milestone: true,
      },
    ]);
    expect([plan.added, plan.updated]).toEqual([0, 1]);
  });

  it("creates tags for unknown columns, inferring number or text", () => {
    const plan = planCsvImport(
      event,
      "日期,晨起身高,备注,地点,\n2022-08-28,124.6,无,家里,\n2022-08-29,,,浦东,\n",
      NOW,
      nextId,
    );
    expect(plan.newTags.map(({ name, type }) => ({ name, type }))).toEqual([
      { name: "晨起身高", type: "number" },
      { name: "地点", type: "text" },
    ]);
    expect(plan.event.tags).toHaveLength(5);
    const [morning, place] = plan.newTags;
    expect(plan.event.days[0].tagValues).toEqual({
      [morning.id]: 124.6,
      [place.id]: "家里",
    });
    expect(plan.event.days[0].note).toBe("无");
    expect(plan.event.days[1].tagValues).toEqual({ [place.id]: "浦东" });
  });

  it("reports bad dates and values without failing the whole file", () => {
    const plan = planCsvImport(
      event,
      "date,身高,swim\n2022-13-01,120,\nlater,121,\n2022-08-24,abc,maybe\n2022-08-25,,\n2022-08-26,123,\n",
      NOW,
      nextId,
    );
    expect(plan.issues).toEqual([
      { line: 2, message: "Skipped: “2022-13-01” is not a date." },
      { line: 3, message: "Skipped: “later” is not a date." },
      { line: 4, message: "身高: “abc” isn't a valid value, skipped." },
      { line: 4, message: "Swim: “maybe” isn't a valid value, skipped." },
    ]);
    // Rows that end up empty add no day.
    expect([plan.added, plan.updated]).toEqual([1, 0]);
    expect(plan.event.days.map((day) => day.date)).toEqual([
      "2022-08-26",
      "2026-10-27",
    ]);
  });

  it("refuses a file without a date column", () => {
    const plan = planCsvImport(event, "when,身高\n2022-08-26,123\n", NOW);
    expect(plan.event).toBe(event);
    expect(plan.issues).toEqual([
      { line: 1, message: "The first row needs a “date” column." },
    ]);
    expect(planCsvImport(event, "", NOW).issues).toHaveLength(1);
  });

  it("generates ids for new tags by default", () => {
    const plan = planCsvImport(event, "date,Mood\n2026-11-01,ok\n", NOW);
    expect(plan.newTags[0].id).toEqual(expect.any(String));
  });
});
