import { useEffect, useState } from "react";

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

/** Renders a syntax-highlighted snippet; shows plain text until Shiki resolves (§7.5). */
export function SnippetView({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void highlightCode(code, language).then((result) => {
      if (active) setHtml(result);
    });
    return () => {
      active = false;
    };
  }, [code, language]);

  if (html === null) {
    return (
      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-sm">
        <code>{code}</code>
      </pre>
    );
  }
  return (
    <div
      className="overflow-x-auto rounded-md text-sm [&_pre]:m-0 [&_pre]:rounded-md [&_pre]:p-3"
      // Shiki escapes the code into spans, so this HTML is safe (no raw user markup passes through).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
