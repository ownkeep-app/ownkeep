import { useEffect, useState, type CSSProperties } from "react";
import { Copy } from "lucide-react";

import { DetailModal } from "@/components/DetailModal";
import { writeClipboard } from "@/lib/clipboard";
import { toastClipboard } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { FillInForm } from "./FillInForm";
import {
  highlightSnippetLines,
  splitCodeLines,
  type HighlightedSnippet,
  type SnippetToken,
} from "./highlight-code";
import { parsePlaceholders } from "./logic";
import type { CommandArgument } from "./types";

function tokenStyle(token: SnippetToken): CSSProperties | undefined {
  if (!token.color && !token.fontStyle) return undefined;
  const style: CSSProperties = {};
  if (token.color) style.color = token.color;
  if (token.fontStyle) {
    if (token.fontStyle & 1) style.fontStyle = "italic";
    if (token.fontStyle & 2) style.fontWeight = "bold";
    if (token.fontStyle & 4) style.textDecoration = "underline";
  }
  return style;
}

function lineText(tokens: SnippetToken[]): string {
  return tokens.map((token) => token.content).join("");
}

async function copyPlainLine(text: string) {
  const ok = await writeClipboard(text);
  toastClipboard(ok, "Line copied");
}

/** Renders a syntax-highlighted snippet; shows plain text until Shiki resolves (§7.5). */
export function SnippetView({
  code,
  language,
  title = "Snippet",
  arguments: args = [],
}: {
  code: string;
  language: string;
  /** Shown in the fill-in dialog when a line has `{{ }}` placeholders. */
  title?: string;
  /** Typed args from the command — enum dropdowns for matching placeholder names. */
  arguments?: CommandArgument[];
}) {
  const [highlighted, setHighlighted] = useState<HighlightedSnippet | null>(
    null,
  );
  const [filling, setFilling] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void highlightSnippetLines(code, language).then((result) => {
      if (active) setHighlighted(result);
    });
    return () => {
      active = false;
    };
  }, [code, language]);

  const lines =
    highlighted?.lines ??
    splitCodeLines(code).map((line) => [{ content: line }]);
  const bg = highlighted?.bg ?? "#24292e";
  const fg = highlighted?.fg ?? "#e1e4e8";

  function startCopyLine(text: string) {
    if (parsePlaceholders(text).length > 0) {
      setFilling(text);
      return;
    }
    void copyPlainLine(text);
  }

  return (
    <>
      <pre
        className="overflow-x-auto rounded-md p-2 text-sm"
        style={{ backgroundColor: bg, color: fg }}
      >
        {lines.map((tokens, index) => {
          const text = lineText(tokens);
          return (
            <button
              aria-label={`Copy line ${index + 1}`}
              className="group relative flex min-h-[1.5rem] w-full cursor-pointer items-start gap-2 rounded-sm pr-8 text-left hover:bg-white/5"
              key={index}
              onClick={() => startCopyLine(text)}
              type="button"
            >
              <code className="min-w-0 flex-1 whitespace-pre font-mono leading-6">
                {tokens.map((token, tokenIndex) => (
                  <span key={tokenIndex} style={tokenStyle(token)}>
                    {token.content}
                  </span>
                ))}
              </code>
              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute right-0 top-0 flex h-6 w-6 items-center justify-center text-muted-foreground opacity-0 transition-opacity",
                  "group-hover:opacity-100 group-focus-visible:opacity-100",
                )}
              >
                <Copy className="h-3.5 w-3.5" />
              </span>
            </button>
          );
        })}
      </pre>

      <DetailModal
        onClose={() => setFilling(null)}
        open={filling !== null}
        title={`Copy ${title}`}
      >
        {filling !== null ? (
          <FillInForm
            arguments={args}
            onCancel={() => setFilling(null)}
            onComplete={(filled) => {
              setFilling(null);
              void copyPlainLine(filled);
            }}
            onRaw={() => {
              setFilling(null);
              void copyPlainLine(filling);
            }}
            template={filling}
            title={title}
          />
        ) : null}
      </DetailModal>
    </>
  );
}
