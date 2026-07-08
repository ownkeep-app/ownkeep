/**
 * Best-effort plain-text clipboard write for NON-secret content — e.g. a filled or raw command
 * (spec §13: non-secret modules round-trip to JS freely). Secrets never use this path; they are
 * copied inside Rust via the concealed pasteboard (§4.5). Returns whether the write succeeded.
 */
export async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
