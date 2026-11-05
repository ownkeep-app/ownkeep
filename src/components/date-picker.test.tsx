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

  describe("jumping to a month and year", () => {
    const yearSelect = () =>
      screen.getByRole("combobox", { name: /choose the year/i });

    it("jumps decades back in one step, without touching the arrows", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <DatePicker aria-label="Date" onChange={onChange} value="2026-10-20" />,
      );
      await user.click(screen.getByLabelText("Date"));
      expect(yearSelect()).toHaveValue("2026");

      await user.selectOptions(yearSelect(), "1985");
      await user.selectOptions(
        screen.getByRole("combobox", { name: /choose the month/i }),
        "6",
      );
      await user.click(
        screen.getByRole("button", { name: /july 26th, 1985/i }),
      );

      expect(onChange).toHaveBeenCalledWith("1985-07-26");
    });

    it("reaches well into the past and the future, not just to this year", async () => {
      const user = userEvent.setup();
      render(<DatePicker aria-label="Date" onChange={() => {}} value="" />);
      await user.click(screen.getByLabelText("Date"));

      const years = [...yearSelect().querySelectorAll("option")].map((option) =>
        Number(option.value),
      );
      const thisYear = new Date().getFullYear();
      expect(years[0]).toBe(1900);
      expect(years[years.length - 1]).toBe(thisYear + 30);
      expect(years).toContain(thisYear + 1);
    });

    it("still steps a month at a time with the arrows", async () => {
      const user = userEvent.setup();
      render(
        <DatePicker aria-label="Date" onChange={() => {}} value="2026-01-15" />,
      );
      await user.click(screen.getByLabelText("Date"));

      await user.click(
        screen.getByRole("button", { name: /go to the previous month/i }),
      );

      expect(yearSelect()).toHaveValue("2025");
    });
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

  it("keeps a different day when clearable", async () => {
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

    await pickDate(user, "Due date", "2026-07-15");
    expect(onChange).toHaveBeenCalledWith("2026-07-15");
  });
});
