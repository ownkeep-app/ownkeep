import { codeToHtml } from "shiki";

function escapeHtml(value: string): string {
  return value.replace(/[&<>]/g, (char) =>
    char === "&" ? "&amp;" : char === "<" ? "&lt;" : "&gt;",
  );
}

/**
 * Highlight `code` to HTML via Shiki (spec §2 — VS Code-quality snippet highlighting). Shiki loads
 * its grammars lazily (bundled, offline); on any failure fall back to plain, escaped text.
 */
export async function highlightCode(
  code: string,
  language: string,
): Promise<string> {
  try {
    return await codeToHtml(code, {
      lang: language || "text",
      theme: "github-dark",
    });
  } catch {
    return `<pre class="shiki-fallback"><code>${escapeHtml(code)}</code></pre>`;
  }
}
