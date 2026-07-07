import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MODULES } from "./registry";

describe("MODULES registry", () => {
  it("declares each module's defaults and dashboard ListView", () => {
    for (const module of MODULES) {
      expect(module.id).toBeTruthy();
      expect(module.title).toBeTruthy();
      const empty = module.createEmpty();
      expect(empty).toBeDefined();
      // Exercise the index builders for coverage; placeholder modules return [].
      expect(
        module.buildIndex(Array.isArray(empty) ? empty : []),
      ).toBeDefined();

      const expectedTitle =
        module.id === "commands" ? "Command library" : module.title;
      const { unmount } = render(<module.ListView items={[]} />);
      expect(screen.getByText(expectedTitle)).toBeVisible();
      unmount();
    }
  });

  it("registers passwords as the first real secret module", () => {
    const passwords = MODULES.find((module) => module.id === "passwords");
    expect(passwords?.secretFields).toEqual(["password"]);

    const index = passwords?.buildIndex([
      {
        id: "github",
        name: "GitHub",
        username: "sha",
        password: "secret",
        loginUrl: "https://github.com/login",
        recoveryUrl: "",
        notes: "",
        tags: ["dev"],
        updatedAt: "2026-07-07T00:00:00.000Z",
      },
    ]);

    expect(index?.[0]).toEqual(
      expect.objectContaining({
        id: "github",
        moduleId: "passwords",
        type: "password",
        displayLine: "GitHub - sha",
      }),
    );
    expect(index?.[0].searchString).not.toContain("secret");
  });
});
