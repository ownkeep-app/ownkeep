import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DatePicker } from "./date-picker";
import { pickDate } from "@/test/date-picker";

describe("DatePicker", () => {
  it("shows a placeholder when empty and calls onChange with YYYY-MM-DD", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DatePicker
        aria-label="Due date"
        onChange={onChange}
        placeholder="Pick a date"
        value=""
      />,
    );

    expect(screen.getByLabelText("Due date")).toHaveTextContent("Pick a date");
    await pickDate(user, "Due date", "2026-07-12");

    expect(onChange).toHaveBeenCalledWith("2026-07-12");
  });

  it("shows the selected date label", () => {
    render(
      <DatePicker
        aria-label="Due date"
        onChange={() => {}}
        value="2026-07-12"
      />,
    );
    expect(screen.getByLabelText("Due date").textContent).toMatch(/2026/);
  });

  it("clears the value when clearable and the same day is reselected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DatePicker
        aria-label="Due date"
        clearable
        onChange={onChange}
        value="2026-07-12"
      />,
    );

    await pickDate(user, "Due date", "2026-07-12");
    expect(onChange).toHaveBeenCalledWith("");
  });
});
