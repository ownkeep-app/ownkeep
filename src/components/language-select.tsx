import { Select, type SelectProps } from "@/components/ui/select";

/** Supported languages for snippet editing (display label → Shiki lang id). */
export const SNIPPET_LANGUAGES = [
  { value: "typescript", label: "TypeScript" },
  { value: "bash", label: "Bash" },
  { value: "sql", label: "SQL" },
  { value: "python", label: "Python" },
  { value: "ruby", label: "Ruby" },
  { value: "css", label: "CSS" },
  { value: "html", label: "HTML" },
  { value: "javascript", label: "JavaScript" },
] as const;

export type SnippetLanguage = (typeof SNIPPET_LANGUAGES)[number]["value"];

/** Default for new command/snippet forms. */
export const DEFAULT_SNIPPET_LANGUAGE: SnippetLanguage = "typescript";

const KNOWN = new Set<string>(SNIPPET_LANGUAGES.map((item) => item.value));

export function snippetLanguageLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  const match = SNIPPET_LANGUAGES.find((item) => item.value === normalized);
  return match?.label ?? value;
}

export function LanguageSelect({
  "aria-label": ariaLabel,
  value,
  ...props
}: Omit<SelectProps, "children">) {
  const current =
    typeof value === "string" && value.trim()
      ? value.trim().toLowerCase()
      : DEFAULT_SNIPPET_LANGUAGE;
  const extras = !KNOWN.has(current)
    ? [{ value: current, label: current }]
    : [];

  return (
    <Select aria-label={ariaLabel} value={current} {...props}>
      {[...SNIPPET_LANGUAGES, ...extras].map((language) => (
        <option key={language.value} value={language.value}>
          {language.label}
        </option>
      ))}
    </Select>
  );
}
