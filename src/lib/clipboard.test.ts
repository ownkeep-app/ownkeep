import { afterEach, describe, expect, it, vi } from "vitest";

import { writeClipboard } from "./clipboard";

const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");

afterEach(() => {
  if (original) Object.defineProperty(navigator, "clipboard", original);
});

function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

describe("writeClipboard", () => {
  it("writes text and reports success", async () => {
    const writeText = vi.fn(async () => {});
    stubClipboard(writeText);
    expect(await writeClipboard("git status")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("git status");
  });

  it("reports failure when the clipboard rejects", async () => {
    stubClipboard(async () => {
      throw new Error("no clipboard");
    });
    expect(await writeClipboard("git status")).toBe(false);
  });
});
