import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { writeClipboard } from "@/lib/clipboard";
import { CopyableLines, splitCopyableLines } from "./CopyableLines";

vi.mock("@/lib/clipboard", () => ({
  writeClipboard: vi.fn(async () => true),
}));

vi.mock("@/lib/toast", () => ({
  toastClipboard: vi.fn(),
}));

describe("CopyableLines", () => {
  beforeEach(() => {
    vi.mocked(writeClipboard).mockClear();
  });

  it("splits lines including empty ones", () => {
    expect(splitCopyableLines("a\n\nb")).toEqual(["a", "", "b"]);
  });

  it("copies a clicked line and truncates when maxLines is set", async () => {
    const user = userEvent.setup();
    render(
      <CopyableLines maxLines={2} text={"one\ntwo\nthree"} />,
    );

    expect(screen.getByRole("button", { name: "Copy line 1" })).toHaveTextContent(
      "one",
    );
    expect(screen.getByText("+1 more line")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Copy line 2" }));
    expect(writeClipboard).toHaveBeenCalledWith("two");
  });

  it("can skip blank lines for compact previews", () => {
    render(
      <CopyableLines maxLines={3} skipBlankLines text={"a\n\n\nb\n\nc\nd"} />,
    );
    expect(screen.getByRole("button", { name: "Copy line 1" })).toHaveTextContent(
      "a",
    );
    expect(screen.getByRole("button", { name: "Copy line 2" })).toHaveTextContent(
      "b",
    );
    expect(screen.getByRole("button", { name: "Copy line 3" })).toHaveTextContent(
      "c",
    );
    expect(screen.getByText("+1 more line")).toBeVisible();
    expect(screen.getAllByRole("button", { name: /Copy line/ })).toHaveLength(3);
  });

  it("hides the copy icon on the last preview line when more lines remain", async () => {
    const user = userEvent.setup();
    render(
      <CopyableLines maxLines={3} text={"one\ntwo\nthree\nfour"} />,
    );

    const last = screen.getByRole("button", { name: "Copy line 3" });
    expect(last.querySelector("svg")).toBeNull();
    await user.click(last);
    expect(writeClipboard).toHaveBeenCalledWith("three");
  });
});
