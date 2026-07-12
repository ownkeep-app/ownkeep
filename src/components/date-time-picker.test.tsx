import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DateTimePicker } from "./date-time-picker";
import { pickDate } from "@/test/date-picker";

describe("DateTimePicker", () => {
  it("defaults a newly picked day to 23:59:59", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DateTimePicker
        aria-label="Todo due"
        onChange={onChange}
        placeholder="No due date"
        value=""
      />,
    );

    expect(screen.getByLabelText("Todo due")).toHaveTextContent("No due date");
    await pickDate(user, "Todo due", "2026-07-12");

    expect(onChange).toHaveBeenCalledWith("2026-07-12T23:59:59");
  });

  it("shows the selected date and time label", () => {
    render(
      <DateTimePicker
        aria-label="Todo due"
        onChange={() => {}}
        value="2026-07-12T09:30:00"
      />,
    );
    expect(screen.getByLabelText("Todo due").textContent).toMatch(/2026/);
  });
});
