import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chooseRowAction, confirmDelete } from "@/test/row-actions";
import { useVaultStore } from "@/stores/vault-store";
import { TodoDetailView, TodosListView } from "./TodosModule";
import type { TodoEntry } from "./types";

const actions = {
  saveTodo: useVaultStore.getState().saveTodo,
  deleteTodo: useVaultStore.getState().deleteTodo,
  toggleTodoDone: useVaultStore.getState().toggleTodoDone,
};

const item: TodoEntry = {
  id: "todo-1",
  title: "Renew passport",
  notes: "Bring photo",
  done: false,
  dueAt: "2026-07-08T12:30:00.000Z",
  notifyLeadMinutes: 30,
  priority: "high",
  category: "Personal",
  recurrence: "weekly",
  updatedAt: "2026-07-08T12:00:00.000Z",
};

describe("TodosListView", () => {
  const saveTodo = vi.fn(async () => {});
  const deleteTodo = vi.fn(async () => {});
  const toggleTodoDone = vi.fn(async () => {});

  beforeEach(() => {
    vi.clearAllMocks();
    useVaultStore.setState({ saveTodo, deleteTodo, toggleTodoDone });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useVaultStore.setState(actions);
  });

  it("renders checklist rows and filters by metadata", async () => {
    const user = userEvent.setup();
    render(
      <TodosListView
        items={[item, { ...item, id: "todo-2", title: "Buy tea" }]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Todos" })).toBeVisible();
    expect(screen.getAllByText("Renew passport")[0]).toBeVisible();

    await user.type(screen.getByLabelText("Filter todos"), "passport");
    expect(screen.getAllByText("Renew passport")[0]).toBeVisible();
    expect(screen.queryByText("Buy tea")).not.toBeInTheDocument();
  });

  it("opens the requested todo detail when focused by the shell", async () => {
    const handled = vi.fn();
    render(
      <TodosListView
        items={[item]}
        focusItemId="todo-1"
        onFocusItemHandled={handled}
      />,
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Renew passport",
    });
    expect(dialog).toBeVisible();
    expect(handled).toHaveBeenCalledTimes(1);
  });

  it("shows a no-matches state when the filter excludes everything", async () => {
    const user = userEvent.setup();
    render(<TodosListView items={[item]} />);

    await user.type(screen.getByLabelText("Filter todos"), "zzz-nomatch");

    expect(screen.getByText(/no matches/i)).toBeVisible();
  });

  it("filters rows by todo status", async () => {
    const user = userEvent.setup();
    render(
      <TodosListView
        items={[
          item,
          { ...item, id: "todo-2", title: "Done task", done: true },
        ]}
      />,
    );

    expect(screen.getByRole("radio", { name: "Undone" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText("Renew passport")).toBeVisible();
    expect(screen.queryByText("Done task")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Done" }));
    expect(screen.queryByText("Renew passport")).not.toBeInTheDocument();
    expect(screen.getByText("Done task")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Clear Filters" }),
    ).toBeVisible();

    await user.click(screen.getByRole("radio", { name: "All" }));
    expect(screen.getByText("Renew passport")).toBeVisible();
    expect(screen.getByText("Done task")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Clear Filters" }));
    expect(screen.getByRole("radio", { name: "Undone" })).toBeChecked();
    expect(
      screen.queryByRole("button", { name: "Clear Filters" }),
    ).not.toBeInTheDocument();
  });

  it("shows an empty Done state when nothing is completed", async () => {
    const user = userEvent.setup();
    render(<TodosListView items={[item]} />);

    await user.click(screen.getByRole("radio", { name: "Done" }));
    expect(screen.getByText("No done todos")).toBeVisible();
  });

  it("shows a due-status badge for open dated todos", () => {
    const now = dayjs();
    render(
      <TodosListView
        items={[
          {
            ...item,
            id: "overdue",
            title: "Overdue task",
            dueAt: now.subtract(2, "day").toISOString(),
          },
          {
            ...item,
            id: "today",
            title: "Today task",
            dueAt: now.toISOString(),
          },
          {
            ...item,
            id: "soon",
            title: "Soon task",
            dueAt: now.add(2, "day").toISOString(),
          },
          {
            ...item,
            id: "done",
            title: "Done task",
            done: true,
            dueAt: now.subtract(1, "day").toISOString(),
          },
        ]}
      />,
    );

    expect(screen.getByText("Overdue")).toBeVisible();
    expect(screen.getByText("Due today")).toBeVisible();
    expect(screen.getByText("Due in 2 days")).toBeVisible();
    // Open dated rows show the badge only — not the absolute due datetime.
    expect(screen.queryByText(/at \d/i)).not.toBeInTheDocument();

    // Done rows are hidden by the default Undone filter, so no overdue badge for them.
    expect(screen.queryByText("Done task")).not.toBeInTheDocument();
  });

  it("edits priority and category inline from the list", async () => {
    const user = userEvent.setup();
    render(<TodosListView items={[item]} />);

    await user.click(
      screen.getByRole("button", { name: "Priority for Renew passport" }),
    );
    await user.click(screen.getByRole("menuitemradio", { name: "Low" }));
    expect(saveTodo).toHaveBeenCalledWith(
      expect.objectContaining({ id: "todo-1", priority: "low" }),
    );

    await user.click(
      screen.getByRole("button", { name: "Category for Renew passport" }),
    );
    await user.click(screen.getByRole("menuitemradio", { name: "Work" }));
    expect(saveTodo).toHaveBeenCalledWith(
      expect.objectContaining({ id: "todo-1", category: "Work" }),
    );
  });

  it("shows colorful priority badges in the list", () => {
    render(
      <TodosListView
        items={[
          { ...item, id: "high", title: "Urgent", priority: "high" },
          { ...item, id: "normal", title: "Routine", priority: "normal" },
          {
            ...item,
            id: "low",
            title: "Later",
            priority: "low",
            dueAt: null,
          },
        ]}
      />,
    );

    expect(screen.getByText("High")).toHaveClass("font-medium");
    expect(screen.getByText("Normal")).toHaveClass("font-medium");
    expect(screen.getByText("Low")).toHaveClass("font-medium");
  });

  it("sorts rows by clicked table headers", async () => {
    const user = userEvent.setup();
    render(
      <TodosListView
        items={[
          item,
          {
            ...item,
            id: "todo-2",
            title: "Buy tea",
            dueAt: null,
            priority: "low",
            category: "Work",
          },
          {
            ...item,
            id: "todo-3",
            title: "Call bank",
            done: true,
            dueAt: "2026-07-07T12:30:00.000Z",
            priority: "normal",
            category: "Dev",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "All" }));

    // Default sort is due ascending.
    expect(todoRowTitles()).toEqual(["Call bank", "Renew passport", "Buy tea"]);

    await user.click(
      screen.getByRole("button", { name: /sort title ascending/i }),
    );
    expect(todoRowTitles()).toEqual(["Buy tea", "Call bank", "Renew passport"]);

    await user.click(
      screen.getByRole("button", { name: /sort title descending/i }),
    );
    expect(todoRowTitles()).toEqual(["Renew passport", "Call bank", "Buy tea"]);

    await user.click(
      screen.getByRole("button", { name: /sort done ascending/i }),
    );
    expect(todoRowTitles()).toEqual(["Renew passport", "Buy tea", "Call bank"]);

    await user.click(
      screen.getByRole("button", { name: /sort due ascending/i }),
    );
    expect(todoRowTitles()).toEqual(["Call bank", "Renew passport", "Buy tea"]);

    await user.click(
      screen.getByRole("button", { name: /sort due descending/i }),
    );
    expect(todoRowTitles()).toEqual(["Buy tea", "Renew passport", "Call bank"]);

    await user.click(
      screen.getByRole("button", { name: /sort priority ascending/i }),
    );
    expect(todoRowTitles()).toEqual(["Renew passport", "Call bank", "Buy tea"]);

    await user.click(
      screen.getByRole("button", { name: /sort category ascending/i }),
    );
    expect(todoRowTitles()).toEqual(["Call bank", "Renew passport", "Buy tea"]);
  });

  it("renders completed todos and detail actions", async () => {
    const user = userEvent.setup();
    render(<TodosListView items={[{ ...item, done: true }]} />);

    await user.click(screen.getByRole("radio", { name: "Done" }));
    expect(screen.getByLabelText("Toggle Renew passport")).toBeChecked();
    await chooseRowAction(user, "Renew passport", "View");
    const dialog = screen.getByRole("dialog", { name: "Renew passport" });
    expect(
      within(dialog).getByRole("button", { name: "Mark open" }),
    ).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Mark open" }));
    expect(toggleTodoDone).toHaveBeenCalledWith("todo-1");

    render(<TodoDetailView item={{ ...item, done: true }} />);
    expect(screen.getAllByText("Done").length).toBeGreaterThan(0);
  });

  it("runs detail edit, close, and delete actions", async () => {
    const user = userEvent.setup();
    render(<TodosListView items={[item]} />);

    await chooseRowAction(user, "Renew", "View");
    let dialog = screen.getByRole("dialog", { name: "Renew passport" });
    await user.click(within(dialog).getByRole("button", { name: "Edit" }));
    expect(
      screen.getByRole("heading", { name: /edit todo/i }),
    ).toBeInTheDocument();
    const cancelButtons = screen.getAllByRole("button", { name: "Cancel" });
    await user.click(cancelButtons[cancelButtons.length - 1]);
    expect(screen.getByRole("heading", { name: "Todos" })).toBeVisible();

    await chooseRowAction(user, "Renew", "View");
    dialog = screen.getByRole("dialog", { name: "Renew passport" });
    await user.click(
      within(dialog).getByRole("button", { name: /close details/i }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Renew passport" }),
      ).not.toBeInTheDocument(),
    );

    await chooseRowAction(user, "Renew", "View");
    dialog = screen.getByRole("dialog", { name: "Renew passport" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await confirmDelete(user);
    expect(deleteTodo).toHaveBeenCalledWith("todo-1");
  });

  it("creates a todo entry from the edit form", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "new-todo" });
    render(<TodosListView items={[]} />);

    await user.click(screen.getByRole("button", { name: "New" }));
    await user.type(screen.getByLabelText("Todo title"), "Pay rent");
    await user.type(screen.getByLabelText("Todo notes"), "monthly");
    await user.type(screen.getByLabelText("Todo due"), "2026-07-09T09:30");
    await user.clear(screen.getByLabelText("Todo reminder lead minutes"));
    await user.type(screen.getByLabelText("Todo reminder lead minutes"), "15");
    await user.selectOptions(screen.getByLabelText("Todo priority"), "high");
    await user.selectOptions(
      screen.getByLabelText("Todo recurrence"),
      "weekly",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(saveTodo).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "new-todo",
        title: "Pay rent",
        notes: "monthly",
        notifyLeadMinutes: 15,
        priority: "high",
        recurrence: "weekly",
        category: "Personal",
      }),
    );
  });

  it("validates required fields before saving", async () => {
    const user = userEvent.setup();
    render(<TodosListView items={[]} />);

    await user.click(screen.getByRole("button", { name: "New" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(saveTodo).not.toHaveBeenCalled();
    expect(screen.getByText(/title is required/i)).toBeVisible();
  });

  it("edits, toggles, and deletes through the store", async () => {
    const user = userEvent.setup();
    render(<TodosListView items={[item]} />);

    await chooseRowAction(user, "Renew", "Edit");
    await user.clear(screen.getByLabelText("Todo title"));
    await user.type(screen.getByLabelText("Todo title"), "Renew passport soon");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(saveTodo).toHaveBeenCalledWith(
      expect.objectContaining({ id: "todo-1", title: "Renew passport soon" }),
    );

    await user.click(screen.getByLabelText("Toggle Renew passport"));
    expect(toggleTodoDone).toHaveBeenCalledWith("todo-1");

    await chooseRowAction(user, "Renew", "Delete");
    await confirmDelete(user);
    expect(deleteTodo).toHaveBeenCalledWith("todo-1");
  });
});

function todoRowTitles(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[2].textContent ?? "");
}
