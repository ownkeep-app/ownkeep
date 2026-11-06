import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RowActionsMenu } from "./RowActionsMenu";
import { chooseRowAction } from "@/test/row-actions";

describe("RowActionsMenu", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Opens a 170 px tall menu from a 30 px trigger at `triggerTop`, in jsdom's 768 px window. */
  async function openMenuAt(triggerTop: number) {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(170);
    render(
      <RowActionsMenu
        label="Actions for GitHub"
        actions={[{ label: "View", onSelect: vi.fn() }]}
      />,
    );
    const trigger = screen.getByRole("button", { name: /actions for github/i });
    trigger.getBoundingClientRect = () =>
      ({
        top: triggerTop,
        bottom: triggerTop + 30,
        right: 1000,
      }) as DOMRect;
    await userEvent.setup().click(trigger);
    return screen.getByRole("menu");
  }

  it.each([
    ["there's room below", 100, { top: "134px", right: "24px" }],
    ["it only just fits below", 560, { top: "594px", right: "24px" }],
    ["there's no room below", 700, { bottom: "72px", right: "24px" }],
  ])("places the menu when %s", async (_case, triggerTop, expected) => {
    const menu = await openMenuAt(triggerTop);
    expect(menu).toHaveStyle(expected);
  });

  it("opens downward when neither side fits but below has more room", async () => {
    vi.stubGlobal("innerHeight", 300);
    const menu = await openMenuAt(100);
    expect(menu).toHaveStyle({ top: "134px" });
    vi.unstubAllGlobals();
  });

  it("flips when a resize takes away the room below", async () => {
    const menu = await openMenuAt(500);
    expect(menu).toHaveStyle({ top: "534px" });

    vi.stubGlobal("innerHeight", 600);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(menu).toHaveStyle({ bottom: "104px" });
    vi.unstubAllGlobals();
  });

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
    await user.keyboard("{ArrowDown}");
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
