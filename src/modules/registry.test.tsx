import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MODULES } from "./registry";

describe("MODULES registry", () => {
  it("declares each module's defaults, empty index, and placeholder ListView", () => {
    for (const module of MODULES) {
      expect(module.id).toBeTruthy();
      expect(module.title).toBeTruthy();
      expect(module.buildIndex([])).toEqual([]);
      expect(module.createEmpty()).toBeDefined();

      render(<module.ListView items={[]} />);
      expect(
        screen.getByText(
          module.title === "Commands" ? "Command library" : module.title,
        ),
      ).toBeVisible();
    }
  });
});
