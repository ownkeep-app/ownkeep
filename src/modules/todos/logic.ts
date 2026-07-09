import type { ReminderEvent, IndexEntry } from "@/modules/types";
import type { VaultSettings } from "@/vault/model";
import {
  defaultCategory,
  defaultTags,
  normalizeTags,
  type TaxonomySettings,
} from "@/vault/taxonomy";
import {
  DEFAULT_TODO_LEAD_MINUTES,
  TODO_PRIORITIES,
  TODO_RECURRENCES,
  TODOS_MODULE_ID,
  type TodoEntry,
  type TodoFormInput,
  type TodoPriority,
  type TodoRecurrence,
} from "./types";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export function isTodoPriority(value: unknown): value is TodoPriority {
  return TODO_PRIORITIES.includes(value as TodoPriority);
}

export function isTodoRecurrence(value: unknown): value is TodoRecurrence {
  return TODO_RECURRENCES.includes(value as TodoRecurrence);
}

export function isTodoEntry(value: unknown): value is TodoEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<TodoEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.title === "string" &&
    typeof entry.notes === "string" &&
    typeof entry.done === "boolean" &&
    (typeof entry.dueAt === "string" || entry.dueAt === null) &&
    typeof entry.notifyLeadMinutes === "number" &&
    isTodoPriority(entry.priority) &&
    typeof entry.category === "string" &&
    Array.isArray(entry.tags) &&
    entry.tags.every((tag) => typeof tag === "string") &&
    isTodoRecurrence(entry.recurrence) &&
    typeof entry.updatedAt === "string"
  );
}

export function todoEntries(items: unknown[]): TodoEntry[] {
  return items.filter(isTodoEntry);
}

export function buildTodoIndex(items: TodoEntry[]): IndexEntry[] {
  return items.map((item) => ({
    id: item.id,
    moduleId: TODOS_MODULE_ID,
    type: "todo",
    searchString: [
      item.title,
      item.notes,
      item.priority,
      item.recurrence === "none" ? "" : item.recurrence,
      item.dueAt ?? "",
      item.category,
      item.tags.join(" "),
    ]
      .filter(Boolean)
      .join(" "),
    displayLine: `${item.done ? "[x]" : "[ ]"} ${item.title}${item.dueAt ? ` - due ${formatDateTime(item.dueAt)}` : ""}`,
  }));
}

export function emptyTodoForm(settings?: TaxonomySettings): TodoFormInput {
  return {
    title: "",
    notes: "",
    dueAt: "",
    notifyLeadMinutes: String(DEFAULT_TODO_LEAD_MINUTES),
    priority: "normal",
    category: defaultCategory(settings),
    tags: defaultTags(settings),
    recurrence: "none",
  };
}

export function formFromTodo(item: TodoEntry): TodoFormInput {
  return {
    title: item.title,
    notes: item.notes,
    dueAt: isoToLocalDateTimeInput(item.dueAt),
    notifyLeadMinutes: String(item.notifyLeadMinutes),
    priority: item.priority,
    category: item.category,
    tags: [...item.tags],
    recurrence: item.recurrence,
  };
}

export function createTodoEntry(
  input: TodoFormInput,
  now: string,
  id: string = crypto.randomUUID(),
): TodoEntry {
  return normalizeTodoEntry(
    {
      id,
      title: input.title,
      notes: input.notes,
      done: false,
      dueAt: localDateTimeInputToIso(input.dueAt),
      notifyLeadMinutes: parseLeadMinutes(input.notifyLeadMinutes),
      priority: input.priority,
      category: input.category.trim(),
      tags: normalizeTags(input.tags),
      recurrence: input.recurrence,
      updatedAt: now,
    },
    now,
  );
}

export function updateTodoEntry(
  existing: TodoEntry,
  input: TodoFormInput,
  now: string,
): TodoEntry {
  return normalizeTodoEntry(
    {
      ...existing,
      title: input.title,
      notes: input.notes,
      dueAt: localDateTimeInputToIso(input.dueAt),
      notifyLeadMinutes: parseLeadMinutes(input.notifyLeadMinutes),
      priority: input.priority,
      category: input.category.trim(),
      tags: normalizeTags(input.tags),
      recurrence: input.recurrence,
      updatedAt: now,
    },
    now,
  );
}

export function validateTodoInput(input: TodoFormInput): string | null {
  if (!input.title.trim()) return "Title is required.";
  if (!input.category.trim()) return "Category is required.";
  if (!Number.isInteger(Number(input.notifyLeadMinutes))) {
    return "Reminder lead must be a whole number of minutes.";
  }
  if (Number(input.notifyLeadMinutes) < 0) {
    return "Reminder lead cannot be negative.";
  }
  if (input.dueAt.trim() && !localDateTimeInputToIso(input.dueAt)) {
    return "Due date is invalid.";
  }
  return null;
}

export function toggleTodoDoneState(item: TodoEntry, now: string): TodoEntry {
  if (!item.done && item.recurrence !== "none" && item.dueAt) {
    const nextDueAt = nextRecurringDueAt(item.dueAt, item.recurrence, now);
    if (nextDueAt) {
      return { ...item, done: false, dueAt: nextDueAt, updatedAt: now };
    }
  }
  return { ...item, done: !item.done, updatedAt: now };
}

export function nextRecurringDueAt(
  dueAt: string,
  recurrence: TodoRecurrence,
  now: string,
): string | null {
  const stepDays = recurrence === "daily" ? 1 : recurrence === "weekly" ? 7 : 0;
  if (!stepDays) return null;

  const due = new Date(dueAt);
  const current = new Date(now);
  if (Number.isNaN(due.getTime()) || Number.isNaN(current.getTime())) {
    return null;
  }

  let next = new Date(due.getTime() + stepDays * DAY_MS);
  while (next.getTime() <= current.getTime()) {
    next = new Date(next.getTime() + stepDays * DAY_MS);
  }
  return next.toISOString();
}

export function collectTodoReminders(
  items: unknown[],
  now: Date,
  settings: VaultSettings,
): ReminderEvent[] {
  return todoEntries(items).flatMap((item) => {
    if (item.done || !item.dueAt) return [];
    const dueTime = Date.parse(item.dueAt);
    if (Number.isNaN(dueTime)) return [];
    const lead = effectiveLeadMinutes(item, settings);
    if (now.getTime() < dueTime - lead * MINUTE_MS) return [];
    return [
      {
        id: `${item.id}:due`,
        title: `Todo due: ${item.title}`,
        body: formatReminderBody(item),
      },
    ];
  });
}

export function sortTodos(items: TodoEntry[]): TodoEntry[] {
  return [...items].sort((a, b) => {
    const leftDue = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY;
    const rightDue = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY;
    if (leftDue !== rightDue) return leftDue - rightDue;
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.title.localeCompare(b.title);
  });
}

export function isoToLocalDateTimeInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * MINUTE_MS);
  return local.toISOString().slice(0, 16);
}

export function localDateTimeInputToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "No due date";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function effectiveLeadMinutes(
  item: TodoEntry,
  settings: VaultSettings,
): number {
  if (Number.isFinite(item.notifyLeadMinutes) && item.notifyLeadMinutes >= 0) {
    return item.notifyLeadMinutes;
  }
  const setting = settings.modules[TODOS_MODULE_ID]?.defaultLeadMinutes;
  return typeof setting === "number" && Number.isFinite(setting) && setting >= 0
    ? setting
    : DEFAULT_TODO_LEAD_MINUTES;
}

function parseLeadMinutes(value: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_TODO_LEAD_MINUTES;
}

function formatReminderBody(item: TodoEntry): string {
  const parts = [`Due ${formatDateTime(item.dueAt)}`];
  if (item.priority !== "normal") parts.push(`${item.priority} priority`);
  if (item.tags.length) parts.push(item.tags.join(", "));
  return parts.join(" - ");
}

function normalizeTodoEntry(
  item: TodoEntry,
  fallbackUpdatedAt: string,
): TodoEntry {
  return {
    id: item.id,
    title: item.title.trim(),
    notes: item.notes.trim(),
    done: item.done,
    dueAt: item.dueAt,
    notifyLeadMinutes: item.notifyLeadMinutes,
    priority: item.priority,
    category: item.category.trim(),
    tags: normalizeTags(item.tags),
    recurrence: item.recurrence,
    updatedAt: item.updatedAt || fallbackUpdatedAt,
  };
}
