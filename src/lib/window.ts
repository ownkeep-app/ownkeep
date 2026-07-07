import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Hide the launcher window — the Esc / lose-focus behavior of the command bar.
 * Isolated here so UI components stay free of direct Tauri calls and remain testable
 * (mock `@/lib/window` in Vitest instead of the Tauri IPC layer).
 */
export async function hideWindow(): Promise<void> {
  await getCurrentWindow().hide();
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
