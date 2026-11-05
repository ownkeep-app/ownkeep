import { t } from "@/i18n";
import { formatDate } from "@/lib/date";
import type { IndexEntry } from "@/modules/types";
import { defaultCategory, type TaxonomySettings } from "@/vault/taxonomy";
import { NOTES_MODULE_ID, type NoteEntry, type NoteFormInput } from "./types";

export { formatDate };

export function isNoteEntry(value: unknown): value is NoteEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<NoteEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.name === "string" &&
    typeof entry.createdAt === "string" &&
    typeof entry.updatedAt === "string" &&
    typeof entry.category === "string" &&
    typeof entry.content === "string"
  );
}

export function noteEntries(items: unknown[]): NoteEntry[] {
  return items.filter(isNoteEntry);
}

export function buildNoteIndex(items: NoteEntry[]): IndexEntry[] {
  return items.map((item) => ({
    id: item.id,
    moduleId: NOTES_MODULE_ID,
    type: "note",
    searchString: [item.name, item.category, item.content]
      .filter(Boolean)
      .join(" "),
    displayLine: item.category ? `${item.name} — ${item.category}` : item.name,
  }));
}

export function sortNotesByUpdated(items: NoteEntry[]): NoteEntry[] {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt);
    const rightTime = Date.parse(right.updatedAt);
    if (leftTime !== rightTime) return rightTime - leftTime;
    return left.name.localeCompare(right.name);
  });
}

export function emptyNoteForm(taxonomy?: TaxonomySettings): NoteFormInput {
  return {
    name: "",
    category: defaultCategory(taxonomy),
    content: "",
  };
}

export function formFromNote(item: NoteEntry): NoteFormInput {
  return {
    name: item.name,
    category: item.category,
    content: item.content,
  };
}

export function createNoteEntry(
  input: NoteFormInput,
  now: string,
  id: string = crypto.randomUUID(),
): NoteEntry {
  return normalizeNoteEntry(
    {
      id,
      name: input.name,
      createdAt: now,
      updatedAt: now,
      category: input.category,
      content: input.content,
    },
    now,
  );
}

export function updateNoteEntry(
  existing: NoteEntry,
  input: NoteFormInput,
  now: string,
): NoteEntry {
  return normalizeNoteEntry(
    {
      ...existing,
      name: input.name,
      category: input.category,
      content: input.content,
      updatedAt: now,
    },
    now,
  );
}

export function validateNoteInput(input: NoteFormInput): string | null {
  if (!input.name.trim()) return t("validation.nameRequired");
  if (!input.category.trim()) return t("validation.categoryRequired");
  return null;
}

function normalizeNoteEntry(item: NoteEntry, fallbackNow: string): NoteEntry {
  return {
    id: item.id,
    name: item.name.trim(),
    createdAt: item.createdAt || fallbackNow,
    updatedAt: item.updatedAt || fallbackNow,
    category: item.category.trim(),
    content: item.content,
  };
}

export function notePreview(content: string, maxLength = 120): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength - 1).trimEnd()}…`;
}
