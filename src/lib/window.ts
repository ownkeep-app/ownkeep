import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Hide the launcher window — the Esc / lose-focus behavior of the command bar.
 * Isolated here so UI components stay free of direct Tauri calls and remain testable
 * (mock `@/lib/window` in Vitest instead of the Tauri IPC layer).
 */
export async function hideWindow(): Promise<void> {
  await getCurrentWindow().hide();
}
