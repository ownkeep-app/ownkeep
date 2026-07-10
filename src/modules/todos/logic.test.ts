import { describe, expect, it, vi } from "vitest";

import {
  buildTodoIndex,
  collectTodoReminders,
  createTodoEntry,
  emptyTodoForm,
  formatDateTime,
  isoToLocalDateTimeInput,
  localDateTimeInputToIso,
  nextRecurringDueAt,
  sortTodos,
  todoEntries,
  toggleTodoDoneState,
  updateTodoEntry,
  validateTodoInput,
} from "./logic";
import type { TodoEntry } from "./types";
import { createDefaultModel } from "@/vault/model";
import { runSchedulerTick } from "@/lib/scheduler";
import { todosModule } from "./module";

const NOW = "2026-07-08T12:00:00.000Z";

function todo(overrides: Partial<TodoEntry> = {}): TodoEntry {
  return {
    id: "todo-1",
    title: "Renew passport",
    notes: "Bring photo",
    done: false,
    dueAt: "2026-07-08T12:30:00.000Z",
    notifyLeadMinutes: 30,
    priority: "normal",
    category: "Personal",
    recurrence: "none",
    updatedAt: NOW,
    ...overrides,
  };
}

describe("todo module logic", () => {
  it("builds searchable todo index entries", () => {
    const index = buildTodoIndex([
      todo(),
      todo({ done: true, dueAt: null, recurrence: "weekly" }),
    ]);

    expect(index[0]).toEqual(
      expect.objectContaining({
        id: "todo-1",
        moduleId: "todos",
        type: "todo",
      }),
    );
    expect(index[0].displayLine).toContain("[ ] Renew passport");
    expect(index[0].searchString).toContain("Bring photo");
    expect(index[1].displayLine).toContain("[x] Renew passport");
    expect(index[1].searchString).toContain("weekly");
  });

  it("normalizes new and edited entries", () => {
    const input = {
      ...emptyTodoForm(),
      title: "  Pay rent  ",
      notes: " monthly ",
      dueAt: "2026-07-09T09:30",
      notifyLeadMinutes: "45",
      priority: "high" as const,
      recurrence: "weekly" as const,
    };

    expect(validateTodoInput(input)).toBeNull();
    const created = createTodoEntry(input, NOW, "new-todo");

    expect(created).toEqual(
      expect.objectContaining({
        id: "new-todo",
        title: "Pay rent",
        notes: "monthly",
        notifyLeadMinutes: 45,
        priority: "high",
        category: "Personal",
        recurrence: "weekly",
      }),
    );
    expect(created.dueAt).toBe(new Date("2026-07-09T09:30").toISOString());

    expect(
      updateTodoEntry(created, { ...emptyTodoForm(), title: "Paid" }, NOW),
    ).toEqual(expect.objectContaining({ title: "Paid", dueAt: null }));
  });

  it("validates title, lead minutes, and due date", () => {
    expect(validateTodoInput(emptyTodoForm())).toMatch(/title/i);
    expect(
      validateTodoInput({
        ...emptyTodoForm(),
        title: "Pay rent",
        notifyLeadMinutes: "-1",
      }),
    ).toMatch(/negative/i);
    expect(
      validateTodoInput({
        ...emptyTodoForm(),
        title: "Pay rent",
        notifyLeadMinutes: "1.5",
      }),
    ).toMatch(/whole number/i);
    expect(
      validateTodoInput({
        ...emptyTodoForm(),
        title: "Pay rent",
        dueAt: "not a date",
      }),
    ).toMatch(/due date/i);
  });

  it("rolls daily and weekly recurring todos forward past now", () => {
    expect(nextRecurringDueAt("2026-07-06T08:00:00.000Z", "daily", NOW)).toBe(
      "2026-07-09T08:00:00.000Z",
    );
    expect(nextRecurringDueAt("2026-07-01T13:00:00.000Z", "weekly", NOW)).toBe(
      "2026-07-08T13:00:00.000Z",
    );

    const rolled = toggleTodoDoneState(
      todo({
        dueAt: "2026-07-01T13:00:00.000Z",
        recurrence: "weekly",
      }),
      NOW,
    );
    expect(rolled.done).toBe(false);
    expect(rolled.dueAt).toBe("2026-07-08T13:00:00.000Z");
    expect(nextRecurringDueAt("bad", "daily", NOW)).toBeNull();
    expect(nextRecurringDueAt(NOW, "none", NOW)).toBeNull();
  });

  it("toggles non-recurring todos done and back open", () => {
    const done = toggleTodoDoneState(todo(), NOW);
    expect(done.done).toBe(true);
    expect(toggleTodoDoneState(done, NOW).done).toBe(false);
  });

  it("collects reminders only when the due time is inside the lead window", () => {
    const settings = createDefaultModel(NOW).settings;
    expect(
      collectTodoReminders(
        [todo({ dueAt: "2026-07-08T12:31:00.000Z" })],
        new Date(NOW),
        settings,
      ),
    ).toEqual([]);

    expect(collectTodoReminders([todo()], new Date(NOW), settings)).toEqual([
      expect.objectContaining({
        id: "todo-1:due",
        title: "Todo due: Renew passport",
      }),
    ]);

    expect(
      collectTodoReminders(
        [
          todo({ done: true }),
          todo({ dueAt: null }),
          todo({ dueAt: "bad date" }),
        ],
        new Date(NOW),
        settings,
      ),
    ).toEqual([]);
  });

  it("falls back to module default lead settings and date labels", () => {
    const settings = {
      ...createDefaultModel(NOW).settings,
      modules: { todos: { enabled: true, defaultLeadMinutes: 10 } },
    };

    expect(
      collectTodoReminders(
        [todo({ dueAt: "2026-07-08T12:09:00.000Z", notifyLeadMinutes: -1 })],
        new Date(NOW),
        settings,
      ),
    ).toHaveLength(1);
    expect(
      createTodoEntry({ ...emptyTodoForm(), title: "Fallback" }, NOW, "x")
        .notifyLeadMinutes,
    ).toBe(30);
    expect(isoToLocalDateTimeInput(null)).toBe("");
    expect(isoToLocalDateTimeInput("bad")).toBe("");
    expect(localDateTimeInputToIso("bad")).toBeNull();
    expect(formatDateTime("bad")).toBe("Invalid date");
  });

  it("filters invalid records and sorts by due date ascending", () => {
    expect(todoEntries([todo(), { id: "bad" }, null])).toEqual([todo()]);

    expect(
      sortTodos([
        todo({ id: "done", title: "Done", done: true, dueAt: null }),
        todo({
          id: "later",
          title: "Later",
          dueAt: "2026-07-10T00:00:00.000Z",
        }),
        todo({ id: "soon", title: "Soon", dueAt: "2026-07-09T00:00:00.000Z" }),
        todo({ id: "undated", title: "Undated", dueAt: null }),
        todo({
          id: "done-early",
          title: "Done early",
          done: true,
          dueAt: "2026-07-08T00:00:00.000Z",
        }),
      ]).map((item) => item.id),
    ).toEqual(["done-early", "soon", "later", "undated", "done"]);
  });

  it("uses scheduler de-dupe for due todo reminders", async () => {
    const model = {
      ...createDefaultModel(NOW),
      settings: {
        ...createDefaultModel(NOW).settings,
        modules: { todos: { enabled: true } },
      },
      modules: { todos: [todo()] },
    };
    const notify = vi.fn(async () => {});

    const first = await runSchedulerTick({
      model,
      modules: [todosModule],
      lastNotified: {},
      now: new Date(NOW),
      notify,
    });
    const second = await runSchedulerTick({
      model,
      modules: [todosModule],
      lastNotified: first.lastNotified,
      now: new Date("2026-07-08T12:01:00.000Z"),
      notify,
    });

    expect(first.sent.map((reminder) => reminder.key)).toEqual([
      "todos:todo-1:due",
    ]);
    expect(second.sent).toEqual([]);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
