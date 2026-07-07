import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hideWindow } from "@/lib/window";
import { useShellStore } from "@/stores/shell-store";
import { CommandBar } from "./CommandBar";

vi.mock("@/lib/window", () => ({
  hideWindow: vi.fn(async () => {}),
}));

const mockHideWindow = vi.mocked(hideWindow);

describe("CommandBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useShellStore.setState({ query: "" });
  });

  it("keeps the query in the shell store", async () => {
    const user = userEvent.setup();
    render(<CommandBar />);

    await user.type(screen.getByRole("combobox", { name: /search/i }), "ssh");

    expect(useShellStore.getState().query).toBe("ssh");
  });

  it("hides the launcher on Escape", () => {
    render(<CommandBar />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(mockHideWindow).toHaveBeenCalledTimes(1);
  });

  it("removes its Escape listener when unmounted", () => {
    const { unmount } = render(<CommandBar />);
    unmount();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(mockHideWindow).not.toHaveBeenCalled();
  });
});
