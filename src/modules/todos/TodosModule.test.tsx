import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  tags: ["life"],
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
        items={[item, { ...item, id: "todo-2", title: "Buy tea", tags: [] }]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Todos" })).toBeVisible();
    expect(screen.getAllByText("Renew passport")[0]).toBeVisible();

    await user.type(screen.getByLabelText("Filter todos"), "life");
    expect(screen.getAllByText("Renew passport")[0]).toBeVisible();
    expect(screen.queryByText("Buy tea")).not.toBeInTheDocument();
  });

  it("renders completed todos and detail actions", async () => {
    const user = userEvent.setup();
    render(<TodosListView items={[{ ...item, done: true }]} />);

    expect(screen.getByLabelText("Toggle Renew passport")).toBeChecked();
    expect(screen.getByRole("button", { name: "Reopen" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Reopen" }));
    expect(toggleTodoDone).toHaveBeenCalledWith("todo-1");

    render(<TodoDetailView item={{ ...item, done: true }} />);
    expect(screen.getAllByText("Done").length).toBeGreaterThan(0);
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
    await user.type(screen.getByLabelText("Todo tags"), "home, bills");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(saveTodo).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "new-todo",
        title: "Pay rent",
        notes: "monthly",
        notifyLeadMinutes: 15,
        priority: "high",
        recurrence: "weekly",
        tags: ["home", "bills"],
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

    await user.click(screen.getByRole("button", { name: /edit renew/i }));
    await user.clear(screen.getByLabelText("Todo title"));
    await user.type(screen.getByLabelText("Todo title"), "Renew passport soon");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(saveTodo).toHaveBeenCalledWith(
      expect.objectContaining({ id: "todo-1", title: "Renew passport soon" }),
    );

    await user.click(screen.getByLabelText("Toggle Renew passport"));
    expect(toggleTodoDone).toHaveBeenCalledWith("todo-1");

    await user.click(screen.getByRole("button", { name: /delete renew/i }));
    expect(deleteTodo).toHaveBeenCalledWith("todo-1");
  });
});
