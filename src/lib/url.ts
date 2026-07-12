import { openUrl } from "@tauri-apps/plugin-opener";

const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Open http(s)/mailto/tel URLs with the system default app via Tauri opener.
 * Falls back to `window.open` / navigation outside Tauri (Vitest / Vite web).
 * WebView `window.open` alone cannot open external sites in the packaged app.
 */
export async function openExternalUrl(value: string): Promise<boolean> {
  try {
    const url = new URL(value);
    if (!EXTERNAL_PROTOCOLS.has(url.protocol)) {
      return false;
    }
    const href = url.toString();
    try {
      await openUrl(href);
      return true;
    } catch {
      // Vitest / Vite browser — no Tauri opener IPC.
      if (url.protocol === "http:" || url.protocol === "https:") {
        window.open(href, "_blank", "noopener,noreferrer");
      } else {
        window.location.href = href;
      }
      return true;
    }
  } catch {
    // Invalid URLs stay inert; edit forms keep them visible for correction.
    return false;
  }
}

/** True when `value` parses as an http(s) URL. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
