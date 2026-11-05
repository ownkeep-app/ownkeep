import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as toasts from "@/lib/toast";
import { chooseRowAction, confirmDelete } from "@/test/row-actions";
import { useVaultStore } from "@/stores/vault-store";
import { createDefaultModel, setModuleSettings } from "@/vault/model";
import { NotesListView } from "./NotesModule";
import type { NoteEntry } from "./types";

const actions = {
  saveNote: useVaultStore.getState().saveNote,
  deleteNote: useVaultStore.getState().deleteNote,
  reorderItems: useVaultStore.getState().reorderItems,
};

const item: NoteEntry = {
  id: "note-1",
  name: "Shipping checklist",
  createdAt: "2026-07-01T10:00:00.000Z",
  updatedAt: "2026-07-08T11:00:00.000Z",
  category: "Work",
  content: "# Ship\n\n- Tag release",
};

describe("NotesListView", () => {
  const saveNote = vi.fn(async () => {});
  const deleteNote = vi.fn(async () => {});
  const reorderItems = vi.fn(async () => {});

  beforeEach(() => {
    saveNote.mockClear();
    deleteNote.mockClear();
    reorderItems.mockClear();
    useVaultStore.setState({
      ...useVaultStore.getState(),
      model: createDefaultModel("2026-07-08T12:00:00.000Z"),
      saveNote,
      deleteNote,
      reorderItems,
    });
  });

  afterEach(() => {
    useVaultStore.setState({
      ...useVaultStore.getState(),
      saveNote: actions.saveNote,
      deleteNote: actions.deleteNote,
      reorderItems: actions.reorderItems,
    });
  });

  describe("drag to sort", () => {
    const older = {
      ...item,
      id: "note-2",
      name: "Older",
      updatedAt: "2026-07-01T00:00:00.000Z",
    };
    const other = {
      ...item,
      id: "note-3",
      name: "Other group",
      category: "Personal",
      updatedAt: "2026-07-02T00:00:00.000Z",
    };
    const handleFor = (name: string) =>
      screen.getByRole("button", { name: `Drag to reorder ${name}` });
    const savedIds = () =>
      (reorderItems.mock.lastCall as unknown as [string, NoteEntry[]])[1].map(
        (note) => note.id,
      );

    it("first freezes the newest-first order on screen, then moves across categories", () => {
      render(<NotesListView items={[older, other, item]} />);

      fireEvent.keyDown(handleFor("Older"), { key: "ArrowUp" });

      expect(reorderItems).toHaveBeenCalledWith("notes", expect.any(Array));
      expect(savedIds()).toEqual(["note-1", "note-2", "note-3"]);
    });

    it("stops at the ends of the list", () => {
      render(<NotesListView items={[older, other, item]} />);
      fireEvent.keyDown(handleFor("Shipping checklist"), { key: "ArrowUp" });
      fireEvent.keyDown(handleFor("Older"), { key: "ArrowDown" });
      expect(reorderItems).not.toHaveBeenCalled();
    });

    it("keeps hidden notes in place when sorting under a filter", async () => {
      const user = userEvent.setup();
      const other2 = { ...other, id: "note-4", name: "Second personal" };
      render(<NotesListView items={[item, other, other2]} />);

      await user.selectOptions(
        screen.getByLabelText("Filter by category"),
        "Personal",
      );
      fireEvent.keyDown(handleFor("Second personal"), { key: "ArrowUp" });

      expect(savedIds()).toEqual(["note-1", "note-4", "note-3"]);
    });

    it("shows the saved order once hand-sorted, ignoring edit times", () => {
      useVaultStore.setState({
        model: setModuleSettings(
          createDefaultModel("2026-07-08T12:00:00.000Z"),
          "notes",
          { manualOrder: true },
        ),
      });
      render(<NotesListView items={[older, item]} />);
      const names = screen
        .getAllByRole("listitem")
        .map((row) => within(row).getAllByRole("button")[1].textContent);
      expect(names).toEqual(["Older", "Shipping checklist"]);
    });

    it("reports a failed save", async () => {
      const toast = vi.spyOn(toasts, "toastError");
      reorderItems.mockRejectedValueOnce(new Error("disk full"));
      render(<NotesListView items={[older, item]} />);

      fireEvent.keyDown(handleFor("Older"), { key: "ArrowUp" });

      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith("Couldn't save the new order."),
      );
    });
  });

  it("lists every note flat, newest first, each with a category badge", () => {
    render(
      <NotesListView
        items={[
          {
            ...item,
            id: "old",
            name: "Old",
            updatedAt: "2026-07-01T00:00:00.000Z",
          },
          { ...item, id: "new", name: "New", category: "Personal" },
          {
            ...item,
            id: "none",
            name: "No category",
            category: "  ",
            updatedAt: "2026-06-01T00:00:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    const rows = screen.getAllByRole("listitem");
    expect(
      rows.map((row) => within(row).getAllByRole("button")[1].textContent),
    ).toEqual(["New", "Old", "No category"]);
    expect(within(rows[0]).getByText("Personal")).toBeVisible();
    expect(within(rows[1]).getByText("Work")).toBeVisible();
    expect(rows[2].querySelector(".rounded-full")).toBeNull();
  });

  it("filters by query/category", async () => {
    const user = userEvent.setup();
    render(
      <NotesListView
        items={[
          item,
          {
            ...item,
            id: "note-2",
            name: "Grocery list",
            category: "Personal",
            updatedAt: "2026-07-07T00:00:00.000Z",
            content: "Milk",
          },
        ]}
      />,
    );

    expect(screen.getByText("Shipping checklist")).toBeVisible();
    expect(screen.getByText("Grocery list")).toBeVisible();
    expect(screen.getByText("Shipping checklist")).toBeVisible();

    await user.type(screen.getByLabelText("Filter notes"), "grocery");
    expect(screen.queryByText("Shipping checklist")).not.toBeInTheDocument();
    expect(screen.getByText("Grocery list")).toBeVisible();
  });

  it("creates, edits, and deletes notes", async () => {
    const user = userEvent.setup();
    render(<NotesListView items={[item]} />);

    await user.click(screen.getByRole("button", { name: "New" }));
    await user.type(screen.getByLabelText("Note name"), "Meeting notes");
    await user.type(
      screen.getByLabelText("Note content"),
      "## Agenda\n\n- Kickoff",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(saveNote).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Meeting notes",
          content: "## Agenda\n\n- Kickoff",
        }),
      );
    });

    await chooseRowAction(user, "Shipping checklist", "Edit");
    await user.clear(screen.getByLabelText("Note name"));
    await user.type(screen.getByLabelText("Note name"), "Release checklist");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(saveNote).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "note-1",
          name: "Release checklist",
        }),
      );
    });

    await chooseRowAction(user, "Shipping checklist", "Delete");
    await confirmDelete(user);
    expect(deleteNote).toHaveBeenCalledWith("note-1");
  });

  it("toggles write and preview modes in the editor", async () => {
    const user = userEvent.setup();
    render(<NotesListView items={[]} />);

    await user.click(screen.getByRole("button", { name: "New" }));
    await user.type(screen.getByLabelText("Note name"), "Preview me");
    await user.type(screen.getByLabelText("Note content"), "**bold**");
    await user.click(screen.getByRole("radio", { name: "Preview" }));
    expect(screen.getByLabelText("Note content preview")).toBeVisible();
    expect(screen.getByText("bold")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Copy line 1" }),
    ).not.toBeInTheDocument();
  });

  it("shows copyable rendered markdown lines in the note detail view", async () => {
    const user = userEvent.setup();
    render(<NotesListView items={[item]} />);

    await chooseRowAction(user, "Shipping checklist", "View");
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Shipping checklist");
    expect(within(dialog).getByText("[Work]")).toBeVisible();
    expect(within(dialog).getByText(/Updated/)).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Copy line 1" }),
    ).toBeVisible();
    expect(within(dialog).getByRole("heading", { level: 1 })).toHaveTextContent(
      "Ship",
    );
  });

  it("shows a no-matches empty state when the filter excludes everything", async () => {
    const user = userEvent.setup();
    render(<NotesListView items={[item]} />);

    await user.type(screen.getByLabelText("Filter notes"), "zzzz");
    expect(screen.getByText("No matches")).toBeVisible();
    expect(screen.getByText(/Nothing matches/)).toBeVisible();
  });

  it("blocks saving a note with no name and explains why", async () => {
    const user = userEvent.setup();
    render(<NotesListView items={[]} />);

    await user.click(screen.getByRole("button", { name: "New" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Name is required.")).toBeVisible();
    expect(saveNote).not.toHaveBeenCalled();
  });

  it("shows a placeholder in the detail view when a note has no body", async () => {
    const user = userEvent.setup();
    render(<NotesListView items={[{ ...item, content: "   " }]} />);

    await chooseRowAction(user, "Shipping checklist", "View");
    expect(
      within(screen.getByRole("dialog")).getByText("Empty note."),
    ).toBeVisible();
  });

  it("omits the category chip for an uncategorized note", async () => {
    const user = userEvent.setup();
    render(<NotesListView items={[{ ...item, category: "" }]} />);

    await chooseRowAction(user, "Shipping checklist", "View");
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Shipping checklist");
    expect(within(dialog).queryByText("[Work]")).not.toBeInTheDocument();
  });

  it("opens the focused note and reports the focus as handled", async () => {
    const onFocusItemHandled = vi.fn();
    render(
      <NotesListView
        focusItemId="note-1"
        items={[item]}
        onFocusItemHandled={onFocusItemHandled}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toHaveAccessibleName(
        "Shipping checklist",
      );
    });
    expect(onFocusItemHandled).toHaveBeenCalled();
  });

  it("opens a focused note even without a focus-handled callback", async () => {
    render(<NotesListView focusItemId="note-1" items={[item]} />);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toHaveAccessibleName(
        "Shipping checklist",
      );
    });
  });

  it("ignores a focus id that matches no note", () => {
    const onFocusItemHandled = vi.fn();
    render(
      <NotesListView
        focusItemId="does-not-exist"
        items={[item]}
        onFocusItemHandled={onFocusItemHandled}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onFocusItemHandled).not.toHaveBeenCalled();
  });

  it("filters by category and clears both filters at once", async () => {
    const user = userEvent.setup();
    render(
      <NotesListView
        items={[
          item,
          {
            ...item,
            id: "note-2",
            name: "Grocery list",
            category: "Personal",
            content: "Milk",
          },
        ]}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText("Filter by category"),
      "Personal",
    );
    expect(screen.getByText("Grocery list")).toBeVisible();
    expect(screen.queryByText("Shipping checklist")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear Filters" }));
    expect(screen.getByText("Shipping checklist")).toBeVisible();
    expect(screen.getByText("Grocery list")).toBeVisible();
  });

  it("explains an empty category rather than showing a bare no-matches", async () => {
    const user = userEvent.setup();
    render(<NotesListView items={[item]} />);

    await user.selectOptions(
      screen.getByLabelText("Filter by category"),
      "Dev",
    );
    expect(screen.getByText("No matches")).toBeVisible();
    expect(screen.getByText("Nothing in this category.")).toBeVisible();
  });
});
