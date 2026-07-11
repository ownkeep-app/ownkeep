import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  currentWindowLabel,
  hideWindow,
  MAIN_WINDOW_EXPANDED,
  mainWindowMode,
  openDashboardToModule,
  resetMainWindowModeForTests,
  setMainWindowMode,
  takeDashboardModule,
} from "./window";

const mockSetSize = vi.fn(async () => {});
const mockSetResizable = vi.fn(async () => {});
const mockHide = vi.fn(async () => {});
const mockInvoke = vi.fn(async (...args: unknown[]): Promise<unknown> => args);
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

  it("waits for an in-flight resize before short-circuiting", async () => {
    let resolveSize!: () => void;
    mockSetSize.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSize = resolve;
        }),
    );

    const first = setMainWindowMode("expanded");
    const second = setMainWindowMode("expanded"); // hits the resizeInFlight branch

    // Allow the resize coroutine to reach the mocked `setSize` call.
    await Promise.resolve();

    resolveSize();
    await expect(Promise.all([first, second])).resolves.toBeDefined();

    expect(mockSetSize).toHaveBeenCalledTimes(1);
  });
});

describe("window helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWindowLabel = "main";
    mockGetWindowThrows = false;
    resetMainWindowModeForTests();
  });

  it("waits for whenMainWindowReady while a resize is in flight", async () => {
    const { whenMainWindowReady } = await import("./window");

    let resolveSize!: () => void;
    mockSetSize.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSize = resolve;
        }),
    );

    const resizing = setMainWindowMode("expanded");
    const ready = whenMainWindowReady();

    let readyResolved = false;
    void ready.then(() => {
      readyResolved = true;
    });

    // Should not resolve until the resize finishes.
    await Promise.resolve();
    expect(readyResolved).toBe(false);

    // Allow the resize coroutine to reach the mocked `setSize` call.
    await Promise.resolve();

    resolveSize();
    await resizing;
    await ready;
    expect(readyResolved).toBe(true);
  });

  it("hides the current window", async () => {
    await hideWindow();

    expect(mockHide).toHaveBeenCalledTimes(1);
  });

  it("opens the Dashboard to a module pane", async () => {
    await openDashboardToModule("todos");

    expect(mockInvoke).toHaveBeenCalledWith("show_dashboard", {
      moduleId: "todos",
    });
  });

  it("swallows show_dashboard IPC failures", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("no ipc"));

    await expect(openDashboardToModule("todos")).resolves.toBeUndefined();
  });

  it("takes a pending Dashboard module selection", async () => {
    mockInvoke.mockResolvedValueOnce("todos");

    await expect(takeDashboardModule()).resolves.toBe("todos");
    expect(mockInvoke).toHaveBeenCalledWith("take_dashboard_module");
  });

  it("returns null when take_dashboard_module IPC fails", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("no ipc"));

    await expect(takeDashboardModule()).resolves.toBeNull();
  });

  it("reads the current window label", () => {
    expect(currentWindowLabel()).toBe("main");
  });

  it("falls back to main outside Tauri", () => {
    mockGetWindowThrows = true;

    expect(currentWindowLabel()).toBe("main");
  });
});
