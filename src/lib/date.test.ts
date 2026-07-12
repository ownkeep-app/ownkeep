import { afterEach, describe, expect, it, vi } from "vitest";

import {
  combineDateAndTime,
  dateInputToIso,
  dateTimeInputToIso,
  dateToDateInput,
  formatDate,
  formatDateTime,
  isoToDateInput,
  isoToDateTimeInput,
  parseDateInput,
} from "./date";

describe("date helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips calendar dates through local end-of-day storage", () => {
    const iso = dateInputToIso("2026-07-12");
    expect(iso).toBe(new Date(2026, 6, 12, 23, 59, 59, 0).toISOString());
    expect(isoToDateInput(iso)).toBe("2026-07-12");
    expect(formatDate(iso)).toMatch(/2026/);
    expect(formatDate(iso)).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("round-trips datetimes through local wall-clock storage", () => {
    const iso = dateTimeInputToIso("2026-07-12T09:30:00");
    expect(iso).toBe(new Date(2026, 6, 12, 9, 30, 0, 0).toISOString());
    expect(isoToDateTimeInput(iso)).toBe("2026-07-12T09:30:00");
    expect(formatDateTime(iso)).toMatch(/2026/);
    expect(formatDateTime(iso)).toMatch(/\d/);
  });

  it("defaults bare dates and missing times to 23:59:59", () => {
    expect(dateTimeInputToIso("2026-07-12")).toBe(
      new Date(2026, 6, 12, 23, 59, 59, 0).toISOString(),
    );
    expect(combineDateAndTime("2026-07-12")).toBe("2026-07-12T23:59:59");
    expect(combineDateAndTime("2026-07-12", "09:30")).toBe(
      "2026-07-12T09:30:00",
    );
  });

  it("rejects blank and invalid date inputs", () => {
    expect(dateInputToIso("")).toBeNull();
    expect(dateInputToIso("not-a-date")).toBeNull();
    expect(dateInputToIso("2026-02-31")).toBeNull();
    expect(dateTimeInputToIso("bad")).toBeNull();
    expect(parseDateInput("2026-13-01")).toBeUndefined();
    expect(isoToDateInput(null)).toBe("");
    expect(isoToDateInput("bad")).toBe("");
    expect(formatDate(null)).toBe("No due date");
    expect(formatDate("bad")).toBe("Invalid date");
    expect(formatDateTime("bad")).toBe("Invalid date");
  });

  it("formats local Date values as YYYY-MM-DD", () => {
    expect(dateToDateInput(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
