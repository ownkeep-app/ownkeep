import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CategorySelect } from "./category-select";
import { CurrencySelect } from "./currency-select";
import { LanguageSelect } from "./language-select";
import { snippetLanguageLabel } from "./snippet-languages";

vi.mock("motion/react", async () => {
  const actual =
    await vi.importActual<typeof import("motion/react")>("motion/react");
  return {
    ...actual,
    useReducedMotion: () => false,
  };
});

describe("CategorySelect", () => {
  it("falls back to the default category when value is empty", () => {
    render(
      <CategorySelect aria-label="Category" options={["Work"]} value="   " />,
    );

    expect(screen.getByLabelText("Category")).toHaveValue("Personal");
  });

  it("keeps an unknown current category in the options list", () => {
    render(
      <CategorySelect
        aria-label="Category"
        options={["Work"]}
        value="Legacy"
      />,
    );

    expect(screen.getByRole("option", { name: "Legacy" })).toBeInTheDocument();
  });
});

describe("LanguageSelect", () => {
  it("falls back to TypeScript when value is blank", () => {
    render(<LanguageSelect aria-label="Language" value="" />);

    expect(screen.getByLabelText("Language")).toHaveValue("typescript");
  });

  it("adds an unknown language as an extra option", () => {
    render(<LanguageSelect aria-label="Language" value="Zig" />);

    expect(screen.getByLabelText("Language")).toHaveValue("zig");
    expect(screen.getByRole("option", { name: "zig" })).toBeInTheDocument();
  });
});

describe("CurrencySelect", () => {
  it("falls back to CNY when value is blank", () => {
    render(<CurrencySelect aria-label="Currency" value="  " />);

    expect(screen.getByLabelText("Currency")).toHaveValue("CNY");
  });

  it("keeps an unknown currency selectable", () => {
    render(<CurrencySelect aria-label="Currency" value="eur" />);

    expect(screen.getByLabelText("Currency")).toHaveValue("EUR");
    expect(screen.getByRole("option", { name: "EUR" })).toBeInTheDocument();
  });
});

describe("snippetLanguageLabel", () => {
  it("returns the display label for known languages and the raw value otherwise", () => {
    expect(snippetLanguageLabel("BASH")).toBe("Bash");
    expect(snippetLanguageLabel("Zig")).toBe("Zig");
  });
});
