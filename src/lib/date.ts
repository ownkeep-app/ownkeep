/** Calendar date string `YYYY-MM-DD` used by date pickers / forms. */
const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Local datetime form value `YYYY-MM-DDTHH:mm:ss`. */
const DATETIME_INPUT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Default local time when the user picks a due date without editing the clock. */
export const DEFAULT_DUE_TIME = "23:59:59";

/**
 * Convert a stored ISO timestamp to a local calendar date for form controls.
 * Uses the user's timezone calendar day (not UTC).
 */
export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return dateToDateInput(date);
}

/**
 * Convert a stored ISO timestamp to a local datetime form value
 * (`YYYY-MM-DDTHH:mm:ss`).
 */
export function isoToDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${dateToDateInput(date)}T${dateToTimeInput(date)}`;
}

/**
 * Convert a `YYYY-MM-DD` form value to ISO, storing local end-of-day
 * (`23:59:59` in the user's timezone). Used by date-only fields
 * (subscriptions, finance).
 */
export function dateInputToIso(value: string): string | null {
  const date = parseDateInput(value);
  if (!date) return null;
  date.setHours(23, 59, 59, 0);
  return date.toISOString();
}

/**
 * Convert a `YYYY-MM-DDTHH:mm:ss` (or `YYYY-MM-DDTHH:mm`) form value to ISO.
 * A bare `YYYY-MM-DD` is accepted and defaults to {@link DEFAULT_DUE_TIME}.
 */
export function dateTimeInputToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (DATE_INPUT_PATTERN.test(trimmed)) {
    return dateInputToIso(trimmed);
  }

  const date = parseDateTimeInput(trimmed);
  if (!date) return null;
  return date.toISOString();
}

/** Format a stored ISO timestamp as a date-only label in the user's locale. */
export function formatDate(
  iso: string | null | undefined,
  emptyLabel = "No due date",
): string {
  if (!iso) return emptyLabel;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Format a stored ISO timestamp as a date + time label in the user's locale. */
export function formatDateTime(
  iso: string | null | undefined,
  emptyLabel = "No due date",
): string {
  if (!iso) return emptyLabel;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Parse `YYYY-MM-DD` into a local Date at midnight (or undefined if invalid). */
export function parseDateInput(value: string): Date | undefined {
  const trimmed = value.trim();
  const match = DATE_INPUT_PATTERN.exec(trimmed);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  return date;
}

/**
 * Parse `YYYY-MM-DDTHH:mm:ss` / `YYYY-MM-DDTHH:mm` into a local Date
 * (or undefined if invalid).
 */
export function parseDateTimeInput(value: string): Date | undefined {
  const trimmed = value.trim();
  const match = DATETIME_INPUT_PATTERN.exec(trimmed);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  if (
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    Number.isNaN(second)
  ) {
    return undefined;
  }
  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return undefined;
  }
  return date;
}

/** Format a local Date as `YYYY-MM-DD`. */
export function dateToDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Format a local Date as `HH:mm:ss`. */
export function dateToTimeInput(date: Date): string {
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${hour}:${minute}:${second}`;
}

/** Normalize a time string to `HH:mm:ss` (accepts `HH:mm`). */
export function normalizeTimeInput(value: string): string | null {
  const trimmed = value.trim();
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return `${match[1]}:${match[2]}:${String(second).padStart(2, "0")}`;
}

/**
 * Build a datetime form value from a calendar day, preserving an existing time
 * when present, otherwise using {@link DEFAULT_DUE_TIME}.
 */
export function combineDateAndTime(
  datePart: string,
  timePart: string | null | undefined = null,
): string | null {
  if (!parseDateInput(datePart)) return null;
  const time = normalizeTimeInput(timePart ?? "") ?? DEFAULT_DUE_TIME;
  return `${datePart}T${time}`;
}
