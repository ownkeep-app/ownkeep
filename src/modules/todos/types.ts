export const TODOS_MODULE_ID = "todos";
export const DEFAULT_TODO_LEAD_MINUTES = 30;

export const TODO_PRIORITIES = ["low", "normal", "high"] as const;
export type TodoPriority = (typeof TODO_PRIORITIES)[number];

export const TODO_RECURRENCES = ["none", "daily", "weekly"] as const;
export type TodoRecurrence = (typeof TODO_RECURRENCES)[number];

export interface TodoEntry {
  id: string;
  title: string;
  notes: string;
  done: boolean;
  dueAt: string | null;
  notifyLeadMinutes: number;
  priority: TodoPriority;
  tags: string[];
  recurrence: TodoRecurrence;
  updatedAt: string;
}

export interface TodoFormInput {
  title: string;
  notes: string;
  dueAt: string;
  notifyLeadMinutes: string;
  priority: TodoPriority;
  tags: string;
  recurrence: TodoRecurrence;
}
