import { codeToTokens, type BundledLanguage } from "shiki";

export type SnippetToken = {
  content: string;
  color?: string;
  fontStyle?: number;
};

export type HighlightedSnippet = {
  bg: string;
  fg: string;
  lines: SnippetToken[][];
};

const FALLBACK_BG = "#24292e";
const FALLBACK_FG = "#e1e4e8";

/** Split snippet source into display lines (matches Shiki's line breaks). */
export function splitCodeLines(code: string): string[] {
  return code.split("\n");
}

function plainLines(code: string): HighlightedSnippet {
  return {
    bg: FALLBACK_BG,
    fg: FALLBACK_FG,
    lines: splitCodeLines(code).map((line) => [{ content: line }]),
  };
}

/**
 * Tokenize `code` via Shiki for per-line rendering (spec §2). Falls back to
 * plain lines when the grammar fails so snippets still remain copyable.
 */
export async function highlightSnippetLines(
  code: string,
  language: string,
): Promise<HighlightedSnippet> {
  try {
    const result = await codeToTokens(code, {
      lang: (language || "text") as BundledLanguage,
      theme: "github-dark",
    });
    return {
      bg: result.bg || FALLBACK_BG,
      fg: result.fg || FALLBACK_FG,
      lines: result.tokens.map((line) =>
        line.map((token) => ({
          content: token.content,
          color: token.color,
          fontStyle: token.fontStyle,
        })),
      ),
    };
  } catch {
    return plainLines(code);
  }
}
