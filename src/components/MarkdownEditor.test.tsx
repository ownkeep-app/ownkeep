import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MarkdownEditor } from "./MarkdownEditor";

describe("MarkdownEditor", () => {
  it("applies bold wrapping to the current selection from the toolbar", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<MarkdownEditor onChange={onChange} value="hello" />);

    const textarea = screen.getByLabelText(
      "Note content",
    ) as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(0, 5);

    await user.click(screen.getByRole("button", { name: "Bold" }));
    expect(onChange).toHaveBeenCalledWith("**hello**");
  });

  it("hides the formatting toolbar in preview mode and renders markdown with line breaks", async () => {
    const user = userEvent.setup();
    render(<MarkdownEditor onChange={() => {}} value={"**hi**\nsecond"} />);

    expect(
      screen.getByRole("toolbar", { name: "Markdown formatting" }),
    ).toBeVisible();
    await user.click(screen.getByRole("radio", { name: "Preview" }));
    expect(
      screen.queryByRole("toolbar", { name: "Markdown formatting" }),
    ).not.toBeInTheDocument();

    const preview = screen.getByLabelText("Note content preview");
    expect(preview.querySelector("br")).not.toBeNull();
    expect(preview.querySelector("strong")).toHaveTextContent("hi");
    expect(
      screen.queryByRole("button", { name: "Copy line 1" }),
    ).not.toBeInTheDocument();
  });

  it("expands over the dashboard pane in full screen mode", async () => {
    const user = userEvent.setup();
    render(
      <div data-dashboard-pane className="relative h-96">
        <MarkdownEditor onChange={() => {}} value="hello" />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Full screen" }));
    expect(
      screen.getByRole("button", { name: "Exit full screen" }),
    ).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Full screen" })).toBeVisible();
  });
});
