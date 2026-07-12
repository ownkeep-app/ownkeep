import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DetailField, DetailFieldSpan } from "./detail-fields";

describe("DetailField", () => {
  it("preserves newlines in multiline values like textarea notes", () => {
    render(
      <DetailFieldSpan
        label="Notes"
        value={"username -> wallet address\npassword -> private key"}
      />,
    );

    const notes = screen.getByText(/username -> wallet address/);
    expect(notes).toHaveClass("whitespace-pre-wrap");
    expect(notes).toHaveTextContent(
      "username -> wallet address password -> private key",
    );
    expect(notes.textContent).toContain("\n");
  });

  it("still renders single-line values", () => {
    render(<DetailField label="Category" value="Finance" />);
    expect(screen.getByText("Finance")).toBeVisible();
  });
});
