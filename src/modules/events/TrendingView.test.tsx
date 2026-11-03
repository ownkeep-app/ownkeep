import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pickDate } from "@/test/date-picker";

import { TrendingView } from "./TrendingView";
import type { TrackedEvent } from "./types";

const event: TrackedEvent = {
  id: "growth",
  title: "堂堂身高",
  description: "",
  status: "open",
  tags: [
    { id: "height", name: "身高", type: "number", icon: "ruler", unit: "cm" },
    { id: "weight", name: "体重", type: "number", icon: "weight", unit: "" },
    { id: "ok", name: "Healthy", type: "boolean", icon: "heart", unit: "" },
  ],
  days: [
    {
      date: "2026-07-05",
      tagValues: { height: 143, ok: true },
      items: [],
      note: "",
    },
    { date: "2026-09-22", tagValues: { height: 145.6 }, items: [], note: "" },
    {
      date: "2026-10-31",
      tagValues: { height: 147.2, weight: -1 },
      items: [],
      note: "",
    },
  ],
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-10-31T00:00:00.000Z",
};

function stat(label: string): string {
  return (
    within(screen.getByText(label).parentElement!).getByRole("definition")
      .textContent ?? ""
  );
}

describe("TrendingView", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 2, 9));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("charts the first number tag with a summary, tooltip and value table", async () => {
    const user = userEvent.setup();
    const onOpenDay = vi.fn();
    render(<TrendingView event={event} onOpenDay={onOpenDay} />);

    expect(screen.getByLabelText("Trend tag")).toHaveValue("height");
    expect(
      within(screen.getByLabelText("Trend tag"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["身高", "体重"]);
    // Default range Jul 5 → today (Nov 2).
    expect(stat("Time Spanning")).toBe("3 months");
    expect(screen.queryByText("Latest")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: "Bar" }),
    ).not.toBeInTheDocument();
    expect(stat("Change")).toBe("+4.2cm");
    expect(stat("Min")).toBe("143cm");
    expect(stat("Max")).toBe("147.2cm");

    expect(screen.getByRole("img", { name: "身高 line chart" })).toBeVisible();
    expect(screen.getByTestId("trend-line").getAttribute("d")).toMatch(
      /^M[\d.]+,[\d.]+ L/,
    );
    expect(document.querySelectorAll("circle")).toHaveLength(3);

    // jsdom has no layout: the hit rect sits at x=0, so clientX 2000 is past the last point.
    const hit = screen.getByTestId("trend-hit");
    fireEvent.pointerMove(hit, { clientX: 2000 });
    expect(screen.getByRole("status")).toHaveTextContent("147.2cm");
    fireEvent.pointerMove(hit, { clientX: 0 });
    expect(screen.getByRole("status")).toHaveTextContent("143cm");
    fireEvent.pointerLeave(hit);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(hit, { clientX: 2000 });
    expect(onOpenDay).toHaveBeenCalledWith("2026-10-31");

    await user.click(screen.getByText("Values (3)"));
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => row.lastElementChild?.textContent)).toEqual([
      "147.2cm",
      "145.6cm",
      "143cm",
    ]);
  });

  it("switches tags, including single or negative values", async () => {
    const user = userEvent.setup();
    render(<TrendingView event={event} onOpenDay={() => {}} />);

    await user.selectOptions(screen.getByLabelText("Trend tag"), "weight");
    expect(document.querySelectorAll("circle")).toHaveLength(1);
    expect(stat("Change")).toBe("±0");
    expect(stat("Min")).toBe("-1");
  });

  it("applies quick ranges and years to the From / To dates", async () => {
    const user = userEvent.setup();
    render(
      <TrendingView
        event={{
          ...event,
          days: [
            {
              date: "2024-03-01",
              tagValues: { height: 130 },
              items: [],
              note: "",
            },
            ...event.days,
          ],
        }}
        onOpenDay={() => {}}
      />,
    );
    const from = () => screen.getByLabelText("From date").textContent;
    const to = () => screen.getByLabelText("To date").textContent;
    const year = screen.getByLabelText("Year");

    expect(
      within(year)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Year", "2026", "2025", "2024"]);
    expect(stat("Time Spanning")).toBe("2 years 8 months");

    const recent = screen.getByLabelText("Recent range");
    expect(
      within(recent)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "Recent",
      "Last 1 month",
      "Last 3 months",
      "Last 6 months",
      "Last 1 year",
    ]);
    expect(recent).toHaveValue("");

    await user.selectOptions(recent, "1m");
    expect(from()).toMatch(/2026.*10.*2|Oct 2, 2026/);
    expect(stat("Time Spanning")).toBe("1 month");

    await user.selectOptions(recent, "3m");
    expect(recent).toHaveValue("3m");
    expect(from()).toMatch(/2026.*8.*2|Aug 2, 2026/);
    expect(to()).toMatch(/2026.*11.*2|Nov 2, 2026/);
    expect(stat("Time Spanning")).toBe("3 months");
    // Sep 22 and Oct 31 fall in the last three months; Jul 5 does not.
    expect(screen.getByText("Values (2)")).toBeInTheDocument();

    await user.selectOptions(recent, "6m");
    expect(stat("Time Spanning")).toBe("6 months");
    await user.selectOptions(recent, "12m");
    expect(stat("Time Spanning")).toBe("1 year");
    expect(year).toHaveValue("");
    // Choosing the placeholder changes nothing.
    await user.selectOptions(recent, "");
    expect(recent).toHaveValue("12m");

    await user.selectOptions(year, "2024");
    expect(year).toHaveValue("2024");
    expect(recent).toHaveValue("");
    expect(from()).toMatch(/2024.*1.*1|Jan 1, 2024/);
    expect(to()).toMatch(/2024.*12.*31|Dec 31, 2024/);
    expect(stat("Time Spanning")).toBe("1 year");
    expect(screen.getByText("Values (1)")).toBeInTheDocument();

    // The current year stops at today.
    await user.selectOptions(year, "2026");
    expect(to()).toMatch(/2026.*11.*2|Nov 2, 2026/);
    await user.selectOptions(year, "");
    expect(year).toHaveValue("2026");
  });

  it("narrows the chart to a date range and resets to first day → today", async () => {
    const user = userEvent.setup();
    render(<TrendingView event={event} onOpenDay={() => {}} />);

    expect(screen.getByLabelText("From date").textContent).toMatch(/2026/);
    expect(
      screen.queryByRole("button", { name: "Reset" }),
    ).not.toBeInTheDocument();
    // The axis runs to today (Nov 2), past the last value on Oct 31.
    expect(
      within(screen.getByRole("img")).getByText(/11月2日|Nov 2/),
    ).toBeInTheDocument();

    await pickDate(user, "From date", "2026-09-01");
    expect(stat("Change")).toBe("+1.6cm");
    expect(stat("Min")).toBe("145.6cm");
    expect(screen.getByText("Values (2)")).toBeInTheDocument();

    await pickDate(user, "To date", "2026-09-10");
    expect(
      screen.getByText("No values for 身高 in this date range."),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText("Values (3)")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reset" }),
    ).not.toBeInTheDocument();
  });

  it("explains missing number tags and missing values", () => {
    const { unmount } = render(
      <TrendingView
        event={{ ...event, tags: [event.tags[2]] }}
        onOpenDay={() => {}}
      />,
    );
    expect(screen.getByText(/add a tag of type number/i)).toBeVisible();
    unmount();

    render(
      <TrendingView event={{ ...event, days: [] }} onOpenDay={() => {}} />,
    );
    expect(screen.getByText(/no values tracked for 身高 yet/i)).toBeVisible();
  });
});
