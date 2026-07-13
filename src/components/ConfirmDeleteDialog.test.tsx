import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";

describe("ConfirmDeleteDialog", () => {
  it("confirms delete and cancels without confirming", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    const { rerender } = render(
      <ConfirmDeleteDialog
        itemName="GitHub"
        onCancel={onCancel}
        onConfirm={onConfirm}
        open
      />,
    );

    expect(
      screen.getByRole("alertdialog", { name: /delete “github”/i }),
    ).toBeVisible();
    expect(screen.getByText("This cannot be undone.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    rerender(
      <ConfirmDeleteDialog
        itemName="GitHub"
        onCancel={onCancel}
        onConfirm={onConfirm}
        open
      />,
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and backdrop dismiss", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <ConfirmDeleteDialog
        itemName="Linode"
        onCancel={onCancel}
        onConfirm={() => {}}
        open
      />,
    );

    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole("button", { name: /dismiss delete confirmation/i }),
    );
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("renders nothing when closed", () => {
    render(
      <ConfirmDeleteDialog
        itemName="GitHub"
        onCancel={() => {}}
        onConfirm={() => {}}
        open={false}
      />,
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
