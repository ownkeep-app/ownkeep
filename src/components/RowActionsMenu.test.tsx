import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RowActionsMenu } from "./RowActionsMenu";
import { chooseRowAction } from "@/test/row-actions";

describe("RowActionsMenu", () => {
  it("opens a menu and runs the selected action", async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    const onDelete = vi.fn();

    render(
      <RowActionsMenu
        label="Actions for GitHub"
        actions={[
          { label: "View", onSelect: onView },
          { label: "Delete", onSelect: onDelete, destructive: true },
        ]}
      />,
    );

    expect(
      screen.queryByRole("menuitem", { name: "View" }),
    ).not.toBeInTheDocument();
    await chooseRowAction(user, "GitHub", "View");
    expect(onView).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("menuitem", { name: "View" }),
    ).not.toBeInTheDocument();
  });

  it("closes on Escape without running an action", async () => {
    const user = userEvent.setup();
    const onView = vi.fn();

    render(
      <RowActionsMenu
        label="Actions for GitHub"
        actions={[{ label: "View", onSelect: onView }]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /actions for github/i }),
    );
    expect(screen.getByRole("menuitem", { name: "View" })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("menuitem", { name: "View" }),
    ).not.toBeInTheDocument();
    expect(onView).not.toHaveBeenCalled();
  });

  it("closes when clicking outside the menu", async () => {
    const user = userEvent.setup();
    const onView = vi.fn();

    render(
      <div>
        <button type="button">Outside</button>
        <RowActionsMenu
          label="Actions for GitHub"
          actions={[{ label: "View", onSelect: onView }]}
        />
      </div>,
    );

    await user.click(
      screen.getByRole("button", { name: /actions for github/i }),
    );
    expect(screen.getByRole("menuitem", { name: "View" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(
      screen.queryByRole("menuitem", { name: "View" }),
    ).not.toBeInTheDocument();
    expect(onView).not.toHaveBeenCalled();
  });
});
