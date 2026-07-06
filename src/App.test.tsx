import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { hideWindow } from "@/lib/window";

vi.mock("@/lib/window", () => ({
  hideWindow: vi.fn(),
}));

describe("App", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the empty keystash search shell", () => {
    render(<App />);

    expect(
      screen.queryByRole("heading", { name: "keystash" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /search keystash/i }),
    ).toBeInTheDocument();
  });

  it("hides the window when Escape is pressed", () => {
    render(<App />);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(hideWindow).toHaveBeenCalledTimes(1);
  });
});
