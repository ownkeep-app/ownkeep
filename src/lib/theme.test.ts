import { describe, expect, it } from "vitest";

import { applyThemeSettings, hexToHslToken, shouldUseDarkTheme } from "./theme";

describe("theme settings", () => {
  it("resolves system/light/dark modes", () => {
    expect(shouldUseDarkTheme("dark", false)).toBe(true);
    expect(shouldUseDarkTheme("light", true)).toBe(false);
    expect(shouldUseDarkTheme("system", true)).toBe(true);
    expect(shouldUseDarkTheme("system", false)).toBe(false);
  });

  it("maps hex accents to shadcn HSL tokens", () => {
    expect(hexToHslToken("#4F7CFF")).toBe("225 100% 65.5%");
    expect(hexToHslToken("#ff0000")).toBe("0 100% 50%");
    expect(hexToHslToken("#ff00aa")).toBe("320 100% 50%");
    expect(hexToHslToken("000000")).toBe("0 0% 0%");
    expect(hexToHslToken("not-a-color")).toBeNull();
  });

  it("applies dark class and primary tokens to the root element", () => {
    const root = document.createElement("div");

    applyThemeSettings("system", "#00AA88", root, true);

    expect(root.classList.contains("dark")).toBe(true);
    expect(root.style.getPropertyValue("--primary")).toBe("168 100% 33.3%");
    expect(root.style.getPropertyValue("--ring")).toBe("168 100% 33.3%");
  });

  it("ignores invalid accent values without clearing the current token", () => {
    const root = document.createElement("div");
    root.style.setProperty("--primary", "224 88% 65%");

    applyThemeSettings("light", "bad", root, false);

    expect(root.classList.contains("dark")).toBe(false);
    expect(root.style.getPropertyValue("--primary")).toBe("224 88% 65%");
  });
});
