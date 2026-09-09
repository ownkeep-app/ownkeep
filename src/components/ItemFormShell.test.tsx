import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ItemFormShell } from "./ItemFormShell";

describe("ItemFormShell", () => {
  it("renders create mode chrome and dismisses from the backdrop", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <ItemFormShell
        cancelLabel="Cancel create"
        mode="create"
        onCancel={onCancel}
        onSubmit={(event) => event.preventDefault()}
        title="New item"
      >
        <label className="col-span-2">
          Name
          <input aria-label="Name" />
        </label>
      </ItemFormShell>,
    );

    expect(screen.getByText("Creating")).toBeVisible();
    expect(screen.getByRole("heading", { name: "New item" })).toBeVisible();
    expect(screen.getByRole("dialog", { name: "New item" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Dismiss form" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows editing mode and cancels on Escape", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <ItemFormShell
        cancelLabel="Cancel edit"
        mode="edit"
        onCancel={onCancel}
        onSubmit={(event) => event.preventDefault()}
        title="Edit item"
      >
        <span className="col-span-2">body</span>
      </ItemFormShell>,
    );

    expect(screen.getByText("Editing")).toBeVisible();
    screen.getByRole("dialog", { name: "Edit item" }).focus();
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalled();
  });

  it("keeps Cancel and Save in a floating actions group", () => {
    render(
      <ItemFormShell
        cancelLabel="Cancel"
        mode="create"
        onCancel={() => {}}
        onSubmit={(event) => event.preventDefault()}
        title="New item"
      >
        <div className="col-span-2 h-[120vh]">tall body</div>
      </ItemFormShell>,
    );

    const actions = screen.getByRole("group", { name: "Form actions" });
    expect(actions).toBeVisible();
    expect(
      within(actions).getByRole("button", { name: "Cancel" }),
    ).toBeVisible();
    expect(within(actions).getByRole("button", { name: "Save" })).toBeVisible();
  });
});
