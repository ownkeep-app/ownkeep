import { formatDate } from "@/lib/date";
import type { IndexEntry } from "@/modules/types";
import {
  defaultCategory,
  type TaxonomySettings,
} from "@/vault/taxonomy";
import { NOTES_MODULE_ID, type NoteEntry, type NoteFormInput } from "./types";

export { formatDate };

const UNCATEGORIZED_GROUP = "Uncategorized";

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
    displayLine: item.category
      ? `${item.name} — ${item.category}`
      : item.name,
  }));
}

export interface NoteGroup {
  category: string;
  notes: NoteEntry[];
}

/** Group notes by category; within each group sort by updatedAt descending. */
export function groupNotesByCategory(items: NoteEntry[]): NoteGroup[] {
  const groups = new Map<string, NoteEntry[]>();
  for (const item of sortNotesByUpdated(items)) {
    const key = item.category.trim() || UNCATEGORIZED_GROUP;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .map(([category, notes]) => ({ category, notes }))
    .sort((left, right) => {
      const leftLatest = Date.parse(left.notes[0]?.updatedAt ?? "");
      const rightLatest = Date.parse(right.notes[0]?.updatedAt ?? "");
      if (leftLatest !== rightLatest) return rightLatest - leftLatest;
      return left.category.localeCompare(right.category);
    });
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
  if (!input.name.trim()) return "Name is required.";
  if (!input.category.trim()) return "Category is required.";
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
