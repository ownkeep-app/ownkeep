import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Pagination } from "./Pagination";

function show(page: number, total = 100) {
  const onPageChange = vi.fn();
  render(
    <Pagination
      onPageChange={onPageChange}
      page={page}
      pageSize={10}
      total={total}
    />,
  );
  return onPageChange;
}

const button = (name: string) => screen.getByRole("button", { name });

describe("Pagination", () => {
  it("says which items are showing, including a short last page", () => {
    show(2);
    expect(screen.getByText("11–20 of 100")).toBeVisible();
  });

  it("caps the range at the total", () => {
    show(3, 25);
    expect(screen.getByText("21–25 of 25")).toBeVisible();
  });

  it("marks the current page and jumps to another", async () => {
    const user = userEvent.setup();
    const onPageChange = show(5);

    expect(button("Page 5")).toHaveAttribute("aria-current", "page");
    expect(button("Page 4")).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("button", { name: "Page 2" })).toBeNull();

    await user.click(button("Page 10"));
    expect(onPageChange).toHaveBeenCalledWith(10);
  });

  it("steps with the arrows", async () => {
    const user = userEvent.setup();
    const onPageChange = show(5);

    await user.click(button("Previous page"));
    expect(onPageChange).toHaveBeenLastCalledWith(4);
    await user.click(button("Next page"));
    expect(onPageChange).toHaveBeenLastCalledWith(6);
  });

  it("disables the arrows at the ends", () => {
    show(1);
    expect(button("Previous page")).toBeDisabled();
    expect(button("Next page")).toBeEnabled();
  });

  it("disables next on the last page", () => {
    show(10);
    expect(button("Next page")).toBeDisabled();
    expect(button("Previous page")).toBeEnabled();
  });
});
