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

export function snippetLanguageLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  const match = SNIPPET_LANGUAGES.find((item) => item.value === normalized);
  return match?.label ?? value;
}
