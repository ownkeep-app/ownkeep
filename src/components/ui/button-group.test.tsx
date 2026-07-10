import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ButtonGroup } from "./button-group";

describe("ButtonGroup", () => {
  it("renders a radiogroup and reports selected value changes", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <ButtonGroup
        aria-label="Status"
        onValueChange={onValueChange}
        options={[
          { value: "one", label: "One" },
          { value: "two", label: "Two" },
        ]}
        value="one"
      />,
    );

    expect(screen.getByRole("radiogroup", { name: "Status" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "One" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await user.click(screen.getByRole("radio", { name: "Two" }));

    expect(onValueChange).toHaveBeenCalledWith("two");
  });

  it("can render tab semantics with controls", () => {
    render(
      <ButtonGroup
        aria-label="Settings menu"
        onValueChange={vi.fn()}
        options={[
          { value: "settings", label: "Settings", controls: "settings-panel" },
          { value: "system", label: "System", controls: "system-panel" },
        ]}
        role="tablist"
        value="system"
      />,
    );

    expect(
      screen.getByRole("tablist", { name: "Settings menu" }),
    ).toBeVisible();
    expect(screen.getByRole("tab", { name: "System" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Settings" })).toHaveAttribute(
      "aria-controls",
      "settings-panel",
    );
  });
});
