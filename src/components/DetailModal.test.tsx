import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DetailModal } from "./DetailModal";

describe("DetailModal", () => {
  it("renders content when open and closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <DetailModal open onClose={onClose} title="GitHub">
        <p>Detail body</p>
      </DetailModal>,
    );

    expect(screen.getByRole("dialog", { name: "GitHub" })).toBeVisible();
    expect(screen.getByText("Detail body")).toBeVisible();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <DetailModal open onClose={onClose} title="Item">
        <p>Body</p>
      </DetailModal>,
    );

    await user.click(screen.getByRole("button", { name: "Dismiss details" }));
    expect(onClose).toHaveBeenCalled();
  });
});
