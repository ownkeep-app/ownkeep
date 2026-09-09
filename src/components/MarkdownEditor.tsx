import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import {
  Bold,
  Code,
  Code2,
  Copy,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  Maximize2,
  Minimize2,
  Quote,
  Strikethrough,
} from "lucide-react";

import {
  ButtonGroup,
  type ButtonGroupOption,
} from "@/components/ui/button-group";
import { Button } from "@/components/ui/button";
import { splitCopyableLines } from "@/components/CopyableLines";
import { writeClipboard } from "@/lib/clipboard";
import {
  applyMarkdownAction,
  type MarkdownToolbarAction,
} from "@/lib/markdown-format";
import { toastClipboard } from "@/lib/toast";
import { cn } from "@/lib/utils";

type EditorMode = "write" | "preview";

const EDITOR_MODES: ButtonGroupOption<EditorMode>[] = [
  { value: "write", label: "Write" },
  { value: "preview", label: "Preview" },
];

const TOOLBAR_ACTIONS: {
  action: MarkdownToolbarAction;
  label: string;
  icon: ReactNode;
}[] = [
  { action: "bold", label: "Bold", icon: <Bold className="h-4 w-4" /> },
  { action: "italic", label: "Italic", icon: <Italic className="h-4 w-4" /> },
  {
    action: "strikethrough",
    label: "Strikethrough",
    icon: <Strikethrough className="h-4 w-4" />,
  },
  {
    action: "heading1",
    label: "Heading 1",
    icon: <Heading1 className="h-4 w-4" />,
  },
  {
    action: "heading2",
    label: "Heading 2",
    icon: <Heading2 className="h-4 w-4" />,
  },
  {
    action: "heading3",
    label: "Heading 3",
    icon: <Heading3 className="h-4 w-4" />,
  },
  { action: "list", label: "List", icon: <List className="h-4 w-4" /> },
  { action: "quote", label: "Quote", icon: <Quote className="h-4 w-4" /> },
  { action: "code", label: "Inline code", icon: <Code className="h-4 w-4" /> },
  {
    action: "codeBlock",
    label: "Code block",
    icon: <Code2 className="h-4 w-4" />,
  },
  { action: "link", label: "Link", icon: <Link className="h-4 w-4" /> },
];

const PANE_SELECTOR = "[data-dashboard-pane]";

export function MarkdownEditor({
  value,
  onChange,
  ariaLabel = "Note content",
  className,
  minHeightClass = "min-h-64",
}: {
  value: string;
  onChange?: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  minHeightClass?: string;
}) {
  const [mode, setMode] = useState<EditorMode>("write");
  const [expanded, setExpanded] = useState(false);
  const [paneHost, setPaneHost] = useState<Element | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editable = typeof onChange === "function";
  const fillPane = expanded && paneHost !== null;

  useLayoutEffect(() => {
    setPaneHost(anchorRef.current?.closest(PANE_SELECTOR) ?? null);
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setExpanded(false);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [expanded]);

  function runAction(action: MarkdownToolbarAction) {
    if (!onChange) return;
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = applyMarkdownAction(value, start, end, action);
    onChange(next.value);
    requestAnimationFrame(() => {
      const target = textareaRef.current;
      if (!target) return;
      target.focus();
      target.setSelectionRange(next.selectionStart, next.selectionEnd);
    });
  }

  const surface = (
    <div
      className={cn(
        "flex flex-col overflow-hidden border border-input bg-card",
        fillPane
          ? "absolute inset-0 z-50 rounded-none border-0"
          : cn("rounded-md", className),
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-2 py-1.5">
        {mode === "write" && editable ? (
          <div
            aria-label="Markdown formatting"
            className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5"
            role="toolbar"
          >
            {TOOLBAR_ACTIONS.map((item) => (
              <Button
                aria-label={item.label}
                className="h-8 w-8"
                key={item.action}
                onClick={() => runAction(item.action)}
                size="icon"
                title={item.label}
                type="button"
                variant="ghost"
              >
                {item.icon}
              </Button>
            ))}
          </div>
        ) : (
          <div className="min-w-0 flex-1" />
        )}
        <ButtonGroup
          aria-label="Editor mode"
          onValueChange={setMode}
          options={EDITOR_MODES}
          value={mode}
        />
        <Button
          aria-label={expanded ? "Exit full screen" : "Full screen"}
          className="h-8 w-8"
          onClick={() => setExpanded((current) => !current)}
          size="icon"
          title={expanded ? "Exit full screen" : "Full screen"}
          type="button"
          variant="ghost"
        >
          {expanded ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </Button>
      </div>
      {mode === "write" && editable ? (
        <textarea
          aria-label={ariaLabel}
          className={cn(
            "block w-full flex-1 bg-transparent px-3 py-2 font-mono text-sm leading-relaxed outline-none placeholder:text-muted-foreground",
            fillPane ? "min-h-0 resize-none" : cn("resize-y", minHeightClass),
          )}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Write Markdown…"
          ref={textareaRef}
          spellCheck
          value={value}
        />
      ) : (
        <div
          aria-label={`${ariaLabel} preview`}
          className={cn(
            "min-h-0 flex-1 overflow-auto px-3 py-2",
            !fillPane && minHeightClass,
          )}
        >
          {value.trim() ? (
            <MarkdownPreview content={value} />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to preview.</p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="relative" ref={anchorRef}>
      {fillPane ? (
        <>
          <div
            aria-hidden
            className={cn("rounded-md border border-dashed border-input", minHeightClass)}
          />
          {createPortal(surface, paneHost)}
        </>
      ) : (
        surface
      )}
    </div>
  );
}

export function MarkdownPreview({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={cn("markdown-body text-sm leading-relaxed", className)}>
      <ReactMarkdown
        rehypePlugins={[rehypeSanitize]}
        remarkPlugins={[remarkGfm, remarkBreaks]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

async function copyMarkdownLine(text: string) {
  const ok = await writeClipboard(text);
  toastClipboard(ok, "Line copied");
}

/**
 * Renders each source line as Markdown and copies that line's raw text on click.
 */
export function CopyableMarkdownPreview({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const lines = splitCopyableLines(content);

  if (lines.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>Empty</p>
    );
  }

  return (
    <div className={cn("space-y-0.5", className)}>
      {lines.map((line, index) => (
        <button
          aria-label={`Copy line ${index + 1}`}
          className="group relative flex min-h-[1.5rem] w-full cursor-pointer items-start rounded-sm pr-8 text-left hover:bg-accent/60"
          key={index}
          onClick={(event) => {
            event.stopPropagation();
            void copyMarkdownLine(line);
          }}
          type="button"
        >
          <div className="markdown-body markdown-line min-w-0 flex-1 text-sm leading-relaxed">
            {line.trim() ? (
              <ReactMarkdown
                rehypePlugins={[rehypeSanitize]}
                remarkPlugins={[remarkGfm, remarkBreaks]}
              >
                {line}
              </ReactMarkdown>
            ) : (
              <span className="block min-h-[1.5rem]">&nbsp;</span>
            )}
          </div>
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
      ))}
    </div>
  );
}
