export const COMMANDS_MODULE_ID = "commands";

/** One syntax-highlighted snippet (spec §6/F2). */
export interface CommandSnippet {
  language: string;
  code: string;
}

export type CommandArgumentType = "text" | "enum";

/** A typed placeholder argument: `text` = free input, `enum` = one of `values` (spec §6). */
export interface CommandArgument {
  name: string;
  type: CommandArgumentType;
  values?: string[];
  description?: string;
}

/** A stored command (spec §5): a titled, categorized snippet with a fill-in copy template. */
export interface CommandEntry {
  id: string;
  category: string;
  title: string;
  description: string;
  snippets: CommandSnippet[];
  /** The string copied on the primary action; `{{name}}` placeholders are filled in (§6/F2). */
  primaryCopyTemplate: string;
  arguments: CommandArgument[];
  tags: string[];
  updatedAt: string;
}

/** The edit-form projection: a single snippet (its code doubles as the copy template) + arg spec. */
export interface CommandFormInput {
  category: string;
  title: string;
  description: string;
  language: string;
  /** Snippet code; also the primary copy template (with `{{ }}` placeholders). */
  code: string;
  /** One argument per line: `name` (text) or `name = a, b, c` (enum). */
  argumentsText: string;
  tags: string;
}
