import { DEFAULT_SNIPPET_LANGUAGE } from "@/components/language-select";
import type { IndexEntry } from "@/modules/types";
import {
  COMMANDS_MODULE_ID,
  type CommandArgument,
  type CommandEntry,
  type CommandFormInput,
} from "./types";

// A placeholder is `{{name}}` where name is [A-Za-z0-9_-] and does not start with a digit (§6/F2).
const PLACEHOLDER_SOURCE = "\\{\\{([A-Za-z_-][A-Za-z0-9_-]*)\\}\\}";
const NAME_PATTERN = /^[A-Za-z_-][A-Za-z0-9_-]*$/;

function placeholderRegex(): RegExp {
  return new RegExp(PLACEHOLDER_SOURCE, "g");
}

/** Unique placeholder names in first-seen order; invalid `{{ }}` shapes are ignored (§6/F2). */
export function parsePlaceholders(template: string): string[] {
  const names: string[] = [];
  for (const match of template.matchAll(placeholderRegex())) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

/**
 * Substitute every `{{name}}` with `values[name]` (all occurrences, anywhere in the string), so a
 * mid-string placeholder like `docker run -p {{port}}:{{port}} {{img}}` fills correctly (§6/F2).
 * Placeholders with no provided value are left intact.
 */
export function fillTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(placeholderRegex(), (match, name: string) =>
    name in values ? values[name] : match,
  );
}

export function isCommandEntry(value: unknown): value is CommandEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<CommandEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.title === "string" &&
    typeof entry.primaryCopyTemplate === "string"
  );
}

export function commandEntries(items: unknown[]): CommandEntry[] {
  return items.filter(isCommandEntry);
}

function capitalize(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

/** One command-bar entry per command (§7.2/§7.4); the secret-free template is safe to index. */
export function buildCommandIndex(items: CommandEntry[]): IndexEntry[] {
  return items.map((item) => ({
    id: item.id,
    moduleId: COMMANDS_MODULE_ID,
    type: "command",
    searchString: [
      item.category,
      item.title,
      item.description,
      item.primaryCopyTemplate,
      item.tags.join(" "),
    ]
      .filter(Boolean)
      .join(" "),
    displayLine: `${capitalize(item.category)} command to ${item.title}: ${item.primaryCopyTemplate}`,
  }));
}

export interface CommandGroup {
  category: string;
  commands: CommandEntry[];
}

/** Group commands by category for the Dashboard `ListView` (§7.5); categories + titles sorted. */
export function groupByCategory(items: CommandEntry[]): CommandGroup[] {
  const groups = new Map<string, CommandEntry[]>();
  for (const item of items) {
    const key = item.category || "Uncategorized";
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([category, commands]) => ({
      category,
      commands: [...commands].sort((a, b) => a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

/** Parse the arguments editor text: one per line — `name` (text) or `name = a, b, c` (enum). */
export function parseArguments(text: string): CommandArgument[] {
  const args: CommandArgument[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const eq = line.indexOf("=");
    const name = (eq >= 0 ? line.slice(0, eq) : line).trim();
    if (!name || seen.has(name) || !NAME_PATTERN.test(name)) continue;
    seen.add(name);
    const values =
      eq >= 0
        ? line
            .slice(eq + 1)
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        : [];
    args.push(
      values.length > 0
        ? { name, type: "enum", values }
        : { name, type: "text" },
    );
  }
  return args;
}

export function argumentsToText(args: CommandArgument[]): string {
  return args
    .map((arg) =>
      arg.type === "enum" && arg.values?.length
        ? `${arg.name} = ${arg.values.join(", ")}`
        : arg.name,
    )
    .join("\n");
}

function parseTags(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

export function emptyCommandForm(): CommandFormInput {
  return {
    category: "",
    title: "",
    description: "",
    language: DEFAULT_SNIPPET_LANGUAGE,
    code: "",
    argumentsText: "",
    tags: "",
  };
}

export function formFromCommand(item: CommandEntry): CommandFormInput {
  const snippet = item.snippets[0];
  return {
    category: item.category,
    title: item.title,
    description: item.description,
    language: snippet?.language ?? DEFAULT_SNIPPET_LANGUAGE,
    code: snippet?.code ?? item.primaryCopyTemplate,
    argumentsText: argumentsToText(item.arguments),
    tags: item.tags.join(", "),
  };
}

export function createCommandEntry(
  input: CommandFormInput,
  now: string,
  id: string = crypto.randomUUID(),
): CommandEntry {
  const code = input.code;
  return {
    id,
    category: input.category.trim(),
    title: input.title.trim(),
    description: input.description.trim(),
    snippets: code.trim()
      ? [
          {
            language:
              input.language.trim().toLowerCase() || DEFAULT_SNIPPET_LANGUAGE,
            code,
          },
        ]
      : [],
    primaryCopyTemplate: code,
    arguments: parseArguments(input.argumentsText),
    tags: parseTags(input.tags),
    updatedAt: now,
  };
}

export function updateCommandEntry(
  existing: CommandEntry,
  input: CommandFormInput,
  now: string,
): CommandEntry {
  return createCommandEntry(input, now, existing.id);
}

export function validateCommandInput(input: CommandFormInput): string | null {
  if (!input.title.trim()) return "Title is required.";
  if (!input.category.trim()) return "Category is required.";
  if (!input.code.trim()) return "A command/snippet is required.";
  return null;
}
