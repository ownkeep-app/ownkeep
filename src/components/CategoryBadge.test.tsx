import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DEFAULT_CATEGORY_OPTIONS } from "@/vault/taxonomy";
import { CategoryBadge } from "./CategoryBadge";

const colorOf = (category: string) => {
  const { container, unmount } = render(<CategoryBadge category={category} />);
  const color = [...container.firstElementChild!.classList].find((name) =>
    name.startsWith("bg-"),
  );
  unmount();
  return color;
};

describe("CategoryBadge", () => {
  it("shows the trimmed category in white on a colour", () => {
    render(<CategoryBadge category="  Work " />);
    const badge = screen.getByText("Work");
    expect(badge).toHaveClass("text-white");
    expect(badge.className).toMatch(/bg-[a-z]+-\d+/);
  });

  it("renders nothing without a category", () => {
    for (const category of ["", "   "]) {
      const { container } = render(<CategoryBadge category={category} />);
      expect(container).toBeEmptyDOMElement();
    }
  });

  it("gives a category the same colour every time, however it's spaced", () => {
    expect(colorOf("Work")).toBe(colorOf("Work"));
    expect(colorOf(" Work ")).toBe(colorOf("Work"));
  });

  it("tells the built-in categories apart", () => {
    const colors = DEFAULT_CATEGORY_OPTIONS.map(colorOf);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("copes with non-Latin category names", () => {
    expect(colorOf("工作")).toMatch(/^bg-/);
  });

  it("accepts positioning from its caller", () => {
    render(<CategoryBadge category="Work" className="absolute" />);
    expect(screen.getByText("Work")).toHaveClass("absolute");
  });
});
