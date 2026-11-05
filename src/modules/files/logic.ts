import { t } from "@/i18n";
import { dateToDateInput } from "@/lib/date";
import type { IndexEntry } from "@/modules/types";
import type { ImportedFile } from "@/vault/api";
import type { VaultSettings } from "@/vault/model";
import { DEFAULT_CATEGORY } from "@/vault/taxonomy";
import {
  FILES_MODULE_ID,
  type FileEntry,
  type FileFormInput,
  type FileKind,
} from "./types";

/** The Rust `file_protocol` scheme that serves decrypted ranges to the WebView. */
const FILE_SCHEME = "ownkeep-file";
const PDF_MIME = "application/pdf";
const BYTES_PER_MB = 1024 * 1024;
const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];
/**
 * Images and PDFs load whole rather than by range, so they must fit in memory. Mirrors Rust's
 * `MAX_WHOLE_RESPONSE`; audio and video seek by range and have no such limit.
 */
export const MAX_WHOLE_PREVIEW_BYTES = 512 * BYTES_PER_MB;

/** Largest image or PDF a grid tile will load as its picture. */
export const MAX_THUMBNAIL_SOURCE_BYTES = 32 * BYTES_PER_MB;

type StoredFileEntry = Omit<FileEntry, "category" | "invalid"> & {
  category?: unknown;
  invalid?: unknown;
};

/** Whether a stored value is a file. Entries from before a field existed count, and get it below. */
export function isFileEntry(value: unknown): value is StoredFileEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<FileEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.title === "string" &&
    typeof entry.description === "string" &&
    typeof entry.date === "string" &&
    typeof entry.fileName === "string" &&
    typeof entry.mime === "string" &&
    typeof entry.size === "number" &&
    typeof entry.createdAt === "string" &&
    typeof entry.updatedAt === "string"
  );
}

export function fileEntries(items: unknown[]): FileEntry[] {
  return items.filter(isFileEntry).map((item) => ({
    ...item,
    category:
      typeof item.category === "string" && item.category.trim()
        ? item.category
        : DEFAULT_CATEGORY,
    invalid: item.invalid === true,
  }));
}

export function buildFileIndex(items: FileEntry[]): IndexEntry[] {
  return items.map((item) => ({
    id: item.id,
    moduleId: FILES_MODULE_ID,
    type: "file",
    searchString: [item.title, item.category, item.description, item.fileName]
      .filter(Boolean)
      .join(" "),
    displayLine: `${item.title} — ${item.fileName}`,
  }));
}

export function fileKind(mime: string): FileKind {
  if (mime === PDF_MIME) return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "other";
}

/** How a file previews in the viewer, or null if it can only be saved. */
export function previewKind(
  file: Pick<FileEntry, "mime" | "size">,
): Exclude<FileKind, "other"> | null {
  const kind = fileKind(file.mime);
  if (kind === "other") return null;
  const loadsWhole = kind === "image" || kind === "pdf";
  return loadsWhole && file.size > MAX_WHOLE_PREVIEW_BYTES ? null : kind;
}

/**
 * What a grid tile can show as its picture, or null for just an icon. Tiles load whole images and PDFs
 * just by being on screen, so they take a far lower limit than opening one on purpose does. A video
 * reads only the little it needs by range, and audio has no picture to show.
 */
export function thumbnailKind(
  file: Pick<FileEntry, "mime" | "size">,
): "image" | "pdf" | "video" | null {
  const kind = previewKind(file);
  if (kind === "video") return kind;
  return (kind === "image" || kind === "pdf") &&
    file.size <= MAX_THUMBNAIL_SOURCE_BYTES
    ? kind
    : null;
}

export function fileSrc(file: Pick<FileEntry, "id" | "mime">): string {
  return `${FILE_SCHEME}://localhost/${file.id}/${file.mime}`;
}

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${BYTE_UNITS[unit]}`;
}

/** Newest first, then by title, so a list reads like a timeline. */
export function sortFiles(items: FileEntry[]): FileEntry[] {
  return [...items].sort(
    (left, right) =>
      right.date.localeCompare(left.date) ||
      left.title.localeCompare(right.title),
  );
}

export function filterFiles(
  items: FileEntry[],
  query: string,
  category = "",
): FileEntry[] {
  const term = query.trim().toLowerCase();
  return items.filter(
    (item) =>
      (!category || item.category === category) &&
      [item.title, item.category, item.description, item.fileName]
        .join(" ")
        .toLowerCase()
        .includes(term),
  );
}

/** Splits files into those in the main list and those kept apart as invalid, keeping their order. */
export function partitionByValidity(items: FileEntry[]): {
  valid: FileEntry[];
  invalid: FileEntry[];
} {
  return {
    valid: items.filter((item) => !item.invalid),
    invalid: items.filter((item) => item.invalid),
  };
}

export function totalBytes(items: FileEntry[]): number {
  return items.reduce((sum, item) => sum + item.size, 0);
}

/** A file's extension for display, like "ZIP". Empty when it has none (`README`, `.env`). */
export function fileExtensionLabel(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(dot + 1).toUpperCase() : "";
}

function titleFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/** New entries start from what the file itself says; the user refines them in the edit form. */
export function fileEntryFromImport(
  imported: ImportedFile,
  now: Date,
  category: string,
): FileEntry {
  const iso = now.toISOString();
  const date =
    imported.modifiedMs === null ? now : new Date(imported.modifiedMs);
  return {
    id: imported.id,
    title: titleFromFileName(imported.fileName),
    category,
    invalid: false,
    description: "",
    date: dateToDateInput(date),
    fileName: imported.fileName,
    mime: imported.mime,
    size: imported.size,
    createdAt: iso,
    updatedAt: iso,
  };
}

export function formFromFile(item: FileEntry): FileFormInput {
  return {
    title: item.title,
    category: item.category,
    invalid: item.invalid,
    description: item.description,
    date: item.date,
  };
}

export function updateFileEntry(
  existing: FileEntry,
  input: FileFormInput,
  now: string,
): FileEntry {
  return {
    ...existing,
    title: input.title.trim(),
    category: input.category.trim(),
    invalid: input.invalid,
    description: input.description,
    date: input.date,
    updatedAt: now,
  };
}

export function validateFileInput(input: FileFormInput): string | null {
  if (!input.title.trim()) return t("validation.titleRequired");
  if (!input.category.trim()) return t("validation.categoryRequired");
  if (!input.date) return t("files.dateRequired");
  return null;
}

/** The configured per-file limit in MB; `0` (the default) means no limit. */
export function maxFileSizeMb(settings: VaultSettings): number {
  const value = settings.modules[FILES_MODULE_ID]?.maxFileSizeMb;
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

export function maxFileSizeBytes(settings: VaultSettings): number {
  return maxFileSizeMb(settings) * BYTES_PER_MB;
}

/** Parse the settings field: a whole number of MB, or null if it isn't one. Blank means no limit. */
export function parseMaxFileSizeMb(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}
