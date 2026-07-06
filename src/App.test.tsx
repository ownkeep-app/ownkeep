import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "./App";

describe("App", () => {
  it("renders the empty keystash search shell", () => {
    render(<App />);

    expect(
      screen.queryByRole("heading", { name: "keystash" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /search keystash/i }),
    ).toBeInTheDocument();
  });
});
