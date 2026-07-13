import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InlineSelect } from "./inline-select";

describe("InlineSelect", () => {
  it("opens a dropdown menu on click and selects a value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <InlineSelect
        aria-label="Category for Example"
        display="Personal"
        onChange={onChange}
        options={["Personal", "Work"]}
        value="Personal"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Category for Example" }),
    );
    await user.click(screen.getByRole("menuitemradio", { name: "Work" }));
    expect(onChange).toHaveBeenCalledWith("Work");
  });

  it("does not call onChange when the current value is chosen again", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <InlineSelect
        aria-label="Priority"
        display="normal"
        onChange={onChange}
        options={["low", "normal", "high"]}
        value="normal"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Priority" }));
    await user.click(screen.getByRole("menuitemradio", { name: "normal" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
