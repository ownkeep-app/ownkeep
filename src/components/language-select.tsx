import { Select, type SelectProps } from "@/components/ui/select";
import {
  DEFAULT_SNIPPET_LANGUAGE,
  SNIPPET_LANGUAGES,
} from "@/components/snippet-languages";

const KNOWN = new Set<string>(SNIPPET_LANGUAGES.map((item) => item.value));

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
