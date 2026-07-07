import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAIN_WINDOW_EXPANDED,
  mainWindowMode,
  resetMainWindowModeForTests,
  setMainWindowMode,
} from "./window";

const mockSetSize = vi.fn(async () => {});
const mockSetResizable = vi.fn(async () => {});
const mockInvoke = vi.fn(async () => {});

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    label: "main",
    setSize: mockSetSize,
    setResizable: mockSetResizable,
  }),
  LogicalSize: class LogicalSize {
    constructor(
      public width: number,
      public height: number,
    ) {}
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("mainWindowMode", () => {
  it("uses compact size only for the unlocked command bar", () => {
    expect(mainWindowMode("unlocked", null)).toBe("compact");
  });

  it("uses expanded size for auth and onboarding screens", () => {
    expect(mainWindowMode("onboarding", null)).toBe("expanded");
    expect(mainWindowMode("locked", null)).toBe("expanded");
    expect(mainWindowMode("reset", null)).toBe("expanded");
    expect(mainWindowMode("loading", null)).toBe("expanded");
  });

  it("uses expanded size while the Emergency Kit is pending", () => {
    expect(
      mainWindowMode("unlocked", {
        app: "keystash",
        recovery_code: "word",
        instructions: "save it",
      }),
    ).toBe("expanded");
  });
});

describe("setMainWindowMode", () => {
  beforeEach(() => {
    resetMainWindowModeForTests();
    vi.clearAllMocks();
  });

  it("resizes once per mode and skips redundant calls", async () => {
    await setMainWindowMode("expanded");
    await setMainWindowMode("expanded");

    expect(mockSetSize).toHaveBeenCalledTimes(1);
    expect(mockSetSize).toHaveBeenCalledWith(
      expect.objectContaining({
        width: MAIN_WINDOW_EXPANDED.width,
        height: MAIN_WINDOW_EXPANDED.height,
      }),
    );
  });

  it("disables blur-to-hide on expanded auth screens", async () => {
    await setMainWindowMode("expanded");
    expect(mockInvoke).toHaveBeenCalledWith("set_main_window_blur_dismiss", {
      enabled: false,
    });
  });

  it("locks resizable only for the compact launcher", async () => {
    await setMainWindowMode("expanded");
    expect(mockSetResizable).toHaveBeenCalledWith(true);
    expect(mockSetResizable).not.toHaveBeenCalledWith(false);

    resetMainWindowModeForTests();
    vi.clearAllMocks();

    await setMainWindowMode("compact");
    expect(mockSetResizable).toHaveBeenCalledWith(true);
    expect(mockSetResizable).toHaveBeenLastCalledWith(false);
    expect(mockInvoke).toHaveBeenCalledWith("set_main_window_blur_dismiss", {
      enabled: true,
    });
  });
});
