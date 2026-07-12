import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

import type { VaultStatus } from "@/stores/vault-store";

/** Launcher chrome for the command bar: search input + up to 9 result rows without scrolling. */
export const MAIN_WINDOW_COMPACT = { width: 720, height: 520 } as const;

/** Tall enough for onboarding, lock/recovery, and the Emergency Kit on the main window. */
export const MAIN_WINDOW_EXPANDED = { width: 720, height: 640 } as const;

export type MainWindowMode = "compact" | "expanded";

export const MAIN_WINDOW_SIZES: Record<
  MainWindowMode,
  { width: number; height: number }
> = {
  compact: MAIN_WINDOW_COMPACT,
  expanded: MAIN_WINDOW_EXPANDED,
};

let appliedMode: MainWindowMode | null = null;
let resizeInFlight: Promise<void> | null = null;

/** Reset cached resize state between Vitest cases. */
export function resetMainWindowModeForTests(): void {
  appliedMode = null;
  resizeInFlight = null;
}

/**
 * Pick the main-window size for the current vault lifecycle screen.
 * Only the unlocked command bar stays compact; everything else needs the full form layout.
 */
export function mainWindowMode(
  status: VaultStatus,
  pendingKit: unknown,
): MainWindowMode {
  if (status === "unlocked" && !pendingKit) {
    return "compact";
  }
  return "expanded";
}

/**
 * Hide the launcher window — the Esc / lose-focus behavior of the command bar.
 * Isolated here so UI components stay free of direct Tauri calls and remain testable
 * (mock `@/lib/window` in Vitest instead of the Tauri IPC layer).
 */
export async function hideWindow(): Promise<void> {
  await getCurrentWindow().hide();
}

/**
 * Show the Dashboard window, optionally selecting a module pane (command-bar → Dashboard bridge, §7.6).
 * Isolated here so UI stays free of direct Tauri calls in tests.
 */
export async function openDashboard(moduleId?: string): Promise<void> {
  try {
    await invoke("show_dashboard", { moduleId: moduleId ?? null });
  } catch {
    // Vitest / Vite dev in a browser — no Tauri IPC.
  }
}

/** Show the Dashboard and select a module pane (command-bar result bridge, §7.6). */
export async function openDashboardToModule(moduleId: string): Promise<void> {
  await openDashboard(moduleId);
}

/**
 * Show the command bar and hide the Dashboard (Dashboard → Search bridge, §7.6).
 */
export async function openCommandBar(): Promise<void> {
  try {
    await invoke("show_command_bar");
  } catch {
    // Vitest / Vite dev in a browser — no Tauri IPC.
  }
}

/** Read and clear a pending Dashboard module selection from the Rust shell. */
export async function takeDashboardModule(): Promise<string | null> {
  try {
    return await invoke<string | null>("take_dashboard_module");
  } catch {
    return null;
  }
}

async function setBlurDismiss(enabled: boolean): Promise<void> {
  try {
    await invoke("set_main_window_blur_dismiss", { enabled });
  } catch {
    // Vitest / Vite dev in a browser — no Tauri IPC.
  }
}

/**
 * Resolves once any in-flight main-window resize completes. Auth inputs should focus only
 * after this so Tauri does not steal focus back from the field.
 */
export async function whenMainWindowReady(): Promise<void> {
  if (resizeInFlight) {
    await resizeInFlight;
  }
}

/**
 * Resize the main launcher window to match the active surface. No-op outside Tauri or on
 * non-main windows (e.g. the Dashboard). Skips redundant calls so setSize does not steal focus.
 *
 * Requires `core:window:allow-set-size` and `core:window:allow-set-resizable` in capabilities.
 * macOS ignores programmatic `setSize` while `resizable: false`, so we toggle resizable briefly.
 */
export async function setMainWindowMode(mode: MainWindowMode): Promise<void> {
  if (mode === appliedMode) {
    return;
  }

  if (resizeInFlight) {
    await resizeInFlight;
    if (mode === appliedMode) {
      return;
    }
  }

  resizeInFlight = (async () => {
    try {
      const win = getCurrentWindow();
      if (win.label !== "main") {
        return;
      }
      const { width, height } = MAIN_WINDOW_SIZES[mode];
      await win.setResizable(true);
      await win.setSize(new LogicalSize(width, height));
      // Keep expanded auth windows resizable — locking resizable breaks keyboard input on macOS.
      if (mode === "compact") {
        await win.setResizable(false);
      }
      // Blur-to-hide is only for the compact launcher (spec §7); auth forms must stay interactive.
      await setBlurDismiss(mode === "compact");
      appliedMode = mode;
    } catch {
      // Vitest / Vite dev in a browser — no Tauri window API.
    } finally {
      resizeInFlight = null;
    }
  })();

  await resizeInFlight;
}

/**
 * The label of the window this WebView runs in ("main" | "dashboard"), used to route the UI.
 * Falls back to "main" outside Tauri (e.g. Vitest).
 */
export function currentWindowLabel(): string {
  try {
    return getCurrentWindow().label;
  } catch {
    return "main";
  }
}
