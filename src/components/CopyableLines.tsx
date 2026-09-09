import { Copy } from "lucide-react";

import { writeClipboard } from "@/lib/clipboard";
import { toastClipboard } from "@/lib/toast";
import { cn } from "@/lib/utils";

/** Split on newlines, keeping empty lines so blank rows stay copyable. */
export function splitCopyableLines(text: string): string[] {
  if (!text) return [];
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

async function copyLine(text: string) {
  const ok = await writeClipboard(text);
  toastClipboard(ok, "Line copied");
}

/**
 * Plaintext lines with per-line copy, matching the Commands snippet affordance.
 */
export function CopyableLines({
  text,
  maxLines,
  className,
  emptyLabel = "Empty",
  skipBlankLines = false,
}: {
  text: string;
  /** When set, only the first N lines are shown. */
  maxLines?: number;
  className?: string;
  emptyLabel?: string;
  /** Drop empty / whitespace-only lines (useful for compact list previews). */
  skipBlankLines?: boolean;
}) {
  const lines = skipBlankLines
    ? splitCopyableLines(text).filter((line) => line.trim().length > 0)
    : splitCopyableLines(text);
  const visible =
    typeof maxLines === "number" ? lines.slice(0, Math.max(0, maxLines)) : lines;
  const truncated =
    typeof maxLines === "number" && lines.length > maxLines
      ? lines.length - maxLines
      : 0;

  if (visible.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className={cn("relative rounded-md", className)}>
      <div className="space-y-0.5 overflow-x-auto text-sm">
        {visible.map((line, index) => {
          const isLast = index === visible.length - 1;
          // Leave room for "+n more lines" and skip the hover copy icon on that row.
          const lastWithMore = isLast && truncated > 0;
          return (
            <button
              aria-label={`Copy line ${index + 1}`}
              className={cn(
                "group relative flex min-h-[1.5rem] w-full cursor-pointer items-start gap-2 rounded-sm text-left text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                lastWithMore ? "pr-28" : "pr-8",
              )}
              key={index}
              onClick={(event) => {
                event.stopPropagation();
                void copyLine(line);
              }}
              type="button"
            >
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono leading-6">
                {line.length > 0 ? line : " "}
              </span>
              {!lastWithMore ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute right-0 top-0 flex h-6 w-6 items-center justify-center text-muted-foreground opacity-0 transition-opacity",
                    "group-hover:opacity-100 group-focus-visible:opacity-100",
                  )}
                >
                  <Copy className="h-3.5 w-3.5" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {truncated > 0 ? (
        <p className="pointer-events-none absolute bottom-0 right-0 text-xs text-muted-foreground">
          +{truncated} more line{truncated === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}
