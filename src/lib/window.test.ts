import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  currentWindowLabel,
  hideWindow,
  MAIN_WINDOW_EXPANDED,
  mainWindowMode,
  resetMainWindowModeForTests,
  setMainWindowMode,
} from "./window";

const mockSetSize = vi.fn(async () => {});
const mockSetResizable = vi.fn(async () => {});
const mockHide = vi.fn(async () => {});
const mockInvoke = vi.fn(async (...args: unknown[]) => args);
let mockWindowLabel = "main";
let mockGetWindowThrows = false;

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => {
    if (mockGetWindowThrows) {
      throw new Error("outside tauri");
    }
    return {
      label: mockWindowLabel,
      hide: mockHide,
      setSize: mockSetSize,
      setResizable: mockSetResizable,
    };
  },
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
    mockWindowLabel = "main";
    mockGetWindowThrows = false;
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

  it("does not resize non-main windows", async () => {
    mockWindowLabel = "dashboard";

    await setMainWindowMode("expanded");

    expect(mockSetSize).not.toHaveBeenCalled();
    expect(mockSetResizable).not.toHaveBeenCalled();
  });

  it("keeps resizing safe when Tauri window APIs are unavailable", async () => {
    mockGetWindowThrows = true;

    await expect(setMainWindowMode("expanded")).resolves.toBeUndefined();

    expect(mockSetSize).not.toHaveBeenCalled();
  });

  it("ignores blur-dismiss IPC failures", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("no ipc"));

    await expect(setMainWindowMode("compact")).resolves.toBeUndefined();
  });
});

describe("window helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWindowLabel = "main";
    mockGetWindowThrows = false;
  });

  it("hides the current window", async () => {
    await hideWindow();

    expect(mockHide).toHaveBeenCalledTimes(1);
  });

  it("reads the current window label", () => {
    expect(currentWindowLabel()).toBe("main");
  });

  it("falls back to main outside Tauri", () => {
    mockGetWindowThrows = true;

    expect(currentWindowLabel()).toBe("main");
  });
});
