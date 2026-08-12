import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import { calendarDueStatus } from "./due-status";

describe("calendarDueStatus", () => {
  it("labels dates as overdue, due today, or due in N days", () => {
    const now = dayjs("2026-07-08T15:00:00");
    expect(calendarDueStatus(null, now.toDate())).toBeNull();
    expect(calendarDueStatus("bad", now.toDate())).toBeNull();

    expect(
      calendarDueStatus(now.subtract(1, "day").toISOString(), now.toDate()),
    ).toEqual({ kind: "overdue", label: "Overdue" });
    expect(calendarDueStatus(now.toISOString(), now.toDate())).toEqual({
      kind: "today",
      label: "Due today",
    });
    expect(
      calendarDueStatus(now.add(1, "day").toISOString(), now.toDate()),
    ).toEqual({ kind: "upcoming", label: "Due in 1 day" });
    expect(
      calendarDueStatus(now.add(3, "day").toISOString(), now.toDate()),
    ).toEqual({ kind: "upcoming", label: "Due in 3 days" });
  });

  it("uses invoice wording when vocabulary is invoice", () => {
    const now = dayjs("2026-07-08T15:00:00");
    expect(
      calendarDueStatus(now.toISOString(), now.toDate(), "invoice"),
    ).toEqual({ kind: "today", label: "Invoice today" });
    expect(
      calendarDueStatus(
        now.add(2, "day").toISOString(),
        now.toDate(),
        "invoice",
      ),
    ).toEqual({ kind: "upcoming", label: "Invoice in 2 days" });
  });
});
