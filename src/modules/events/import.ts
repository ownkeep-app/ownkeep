import { t } from "@/i18n";
import { parseCsv } from "@/lib/csv";
import { dateToDateInput, parseDateInput } from "@/lib/date";
import { createTag, dayFor, emptyDay, upsertDay } from "./logic";
import type { EventDay, EventTag, TagValue, TrackedEvent } from "./types";

/** Header names (lower-cased) for the non-tag columns; every other column is a tag. */
const DATE_HEADERS = ["date", "日期"];
const NOTE_HEADERS = ["note", "备注"];
const MILESTONE_HEADERS = ["milestone", "里程碑"];
const TRUE_WORDS = ["y", "yes", "true", "1", "是"];
const FALSE_WORDS = ["n", "no", "false", "0", "否"];
const NOTE_SEPARATOR = "\n";

export interface ImportIssue {
  /** 1-based line in the file, header included. */
  line: number;
  message: string;
}

export interface ImportPlan {
  /** The event with every importable row merged in. */
  event: TrackedEvent;
  newTags: EventTag[];
  added: number;
  updated: number;
  issues: ImportIssue[];
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase();
}

/** `YYYY-MM-DD` or `YYYY/M/D` → day key; anything else is rejected. */
function parseImportDate(raw: string): string | null {
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(raw.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = parseDateInput(
    `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
  );
  return date ? dateToDateInput(date) : null;
}

function parseBoolean(raw: string): boolean | undefined {
  const word = raw.trim().toLowerCase();
  if (TRUE_WORDS.includes(word)) return true;
  if (FALSE_WORDS.includes(word)) return false;
  return undefined;
}

function parseCell(tag: EventTag, raw: string): TagValue | undefined {
  if (tag.type === "boolean") return parseBoolean(raw);
  if (tag.type === "number") {
    const value = Number(raw.trim());
    return Number.isFinite(value) ? value : undefined;
  }
  return raw.trim();
}

/** A column with no matching tag becomes a number tag if every filled cell is numeric. */
function inferTag(
  name: string,
  cells: string[],
  createId: () => string,
): EventTag {
  const filled = cells.filter((cell) => cell.trim());
  const numeric = filled.every((cell) => Number.isFinite(Number(cell.trim())));
  return { ...createTag(createId()), name, type: numeric ? "number" : "text" };
}

function mergeNote(existing: string, incoming: string): string {
  if (!incoming || existing.includes(incoming)) return existing;
  return existing ? `${existing}${NOTE_SEPARATOR}${incoming}` : incoming;
}

/**
 * Plan a CSV import into an event without saving anything: rows merge into existing days (cells
 * overwrite that tag's value, notes append, a milestone flag is only ever added), unknown columns
 * become new tags, and bad cells are reported and skipped rather than failing the whole file.
 */
export function planCsvImport(
  event: TrackedEvent,
  text: string,
  now: string,
  createId: () => string = () => crypto.randomUUID(),
): ImportPlan {
  const [header = [], ...rows] = parseCsv(text);
  const headers = header.map(normalizeHeader);
  const dateColumn = headers.findIndex((name) => DATE_HEADERS.includes(name));
  if (dateColumn < 0) {
    return {
      event,
      newTags: [],
      added: 0,
      updated: 0,
      issues: [{ line: 1, message: t("events.importNeedsDate") }],
    };
  }
  const noteColumn = headers.findIndex((name) => NOTE_HEADERS.includes(name));
  const milestoneColumn = headers.findIndex((name) =>
    MILESTONE_HEADERS.includes(name),
  );

  const newTags: EventTag[] = [];
  const tagColumns = header.flatMap((name, column) => {
    if (
      [dateColumn, noteColumn, milestoneColumn].includes(column) ||
      !name.trim()
    )
      return [];
    const existing = event.tags.find(
      (tag) => normalizeHeader(tag.name) === headers[column],
    );
    if (existing) return [{ column, tag: existing }];
    const created = inferTag(
      name.trim(),
      rows.map((row) => row[column] ?? ""),
      createId,
    );
    newTags.push(created);
    return [{ column, tag: created }];
  });

  const issues: ImportIssue[] = [];
  const originalDates = new Set(event.days.map((day) => day.date));
  const touched = new Set<string>();
  let merged: TrackedEvent = { ...event, tags: [...event.tags, ...newTags] };

  rows.forEach((row, index) => {
    const line = index + 2;
    const date = parseImportDate(row[dateColumn] ?? "");
    if (!date) {
      issues.push({
        line,
        message: t("events.importNotDate", { value: row[dateColumn] ?? "" }),
      });
      return;
    }
    const current = dayFor(merged, date) ?? emptyDay(date);
    const tagValues = { ...current.tagValues };
    for (const { column, tag } of tagColumns) {
      const raw = row[column] ?? "";
      if (!raw.trim()) continue;
      const value = parseCell(tag, raw);
      if (value === undefined) {
        issues.push({
          line,
          message: t("events.importBadValue", { tag: tag.name, value: raw }),
        });
        continue;
      }
      tagValues[tag.id] = value;
    }
    const next: EventDay = {
      ...current,
      tagValues,
      note:
        noteColumn >= 0
          ? mergeNote(current.note, (row[noteColumn] ?? "").trim())
          : current.note,
      milestone:
        current.milestone ||
        (milestoneColumn >= 0 &&
          parseBoolean(row[milestoneColumn] ?? "") === true),
    };
    merged = upsertDay(merged, next, now);
    touched.add(date);
  });

  // Count against the result: a row with nothing importable leaves no day behind.
  const kept = [...touched].filter((date) => dayFor(merged, date));
  return {
    event: { ...merged, updatedAt: now },
    newTags,
    added: kept.filter((date) => !originalDates.has(date)).length,
    updated: kept.filter((date) => originalDates.has(date)).length,
    issues,
  };
}
