/**
 * Pure Markdown selection helpers for the editor toolbar.
 * Wrap/prefix the current selection (or insert a placeholder when empty).
 */

export interface MarkdownSelection {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder = "text",
): MarkdownSelection {
  const selected = value.slice(start, end);
  const body = selected || placeholder;
  const next = `${value.slice(0, start)}${before}${body}${after}${value.slice(end)}`;
  if (selected) {
    return {
      value: next,
      selectionStart: start + before.length,
      selectionEnd: start + before.length + body.length,
    };
  }
  return {
    value: next,
    selectionStart: start + before.length,
    selectionEnd: start + before.length + body.length,
  };
}

/** Prefix each selected line (or the current line) with a marker such as `# ` or `- `. */
export function prefixLines(
  value: string,
  start: number,
  end: number,
  prefix: string,
): MarkdownSelection {
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEndIndex = value.indexOf("\n", end);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.length === 0 ? [""] : block.split("\n");
  const rewritten = lines
    .map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`))
    .join("\n");
  const next = `${value.slice(0, lineStart)}${rewritten}${value.slice(lineEnd)}`;
  return {
    value: next,
    selectionStart: lineStart,
    selectionEnd: lineStart + rewritten.length,
  };
}

export type MarkdownToolbarAction =
  | "bold"
  | "italic"
  | "strikethrough"
  | "heading1"
  | "heading2"
  | "heading3"
  | "link"
  | "code"
  | "codeBlock"
  | "list"
  | "quote";

export function applyMarkdownAction(
  value: string,
  start: number,
  end: number,
  action: MarkdownToolbarAction,
): MarkdownSelection {
  switch (action) {
    case "bold":
      return wrapSelection(value, start, end, "**", "**", "bold");
    case "italic":
      return wrapSelection(value, start, end, "*", "*", "italic");
    case "strikethrough":
      return wrapSelection(value, start, end, "~~", "~~", "text");
    case "code":
      return wrapSelection(value, start, end, "`", "`", "code");
    case "link":
      return wrapSelection(value, start, end, "[", "](url)", "link");
    case "codeBlock":
      return wrapSelection(value, start, end, "```\n", "\n```", "code");
    case "heading1":
      return prefixLines(value, start, end, "# ");
    case "heading2":
      return prefixLines(value, start, end, "## ");
    case "heading3":
      return prefixLines(value, start, end, "### ");
    case "list":
      return prefixLines(value, start, end, "- ");
    case "quote":
      return prefixLines(value, start, end, "> ");
  }
}
