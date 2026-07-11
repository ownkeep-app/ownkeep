import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EmptyState } from "./EmptyState";

const useReducedMotion = vi.fn(() => false);

vi.mock("motion/react", async () => {
  const actual =
    await vi.importActual<typeof import("motion/react")>("motion/react");
  return {
    ...actual,
    useReducedMotion: () => useReducedMotion(),
  };
});

describe("EmptyState", () => {
  beforeEach(() => {
    useReducedMotion.mockReturnValue(false);
  });

  it("renders an optional action and skips motion when reduced-motion is on", () => {
    useReducedMotion.mockReturnValue(true);

    render(
      <EmptyState
        action={<button type="button">New item</button>}
        description="Nothing here yet."
        title="Empty"
      />,
    );

    expect(screen.getByText("Empty")).toBeVisible();
    expect(screen.getByText("Nothing here yet.")).toBeVisible();
    expect(screen.getByRole("button", { name: "New item" })).toBeVisible();
  });

  it("renders without an action", () => {
    render(<EmptyState description="Try another filter." title="No matches" />);

    expect(screen.getByText("No matches")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
