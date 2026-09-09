import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chooseRowAction, confirmDelete } from "@/test/row-actions";
import { useVaultStore } from "@/stores/vault-store";
import { createDefaultModel } from "@/vault/model";
import { NotesListView } from "./NotesModule";
import type { NoteEntry } from "./types";

const actions = {
  saveNote: useVaultStore.getState().saveNote,
  deleteNote: useVaultStore.getState().deleteNote,
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

  beforeEach(() => {
    saveNote.mockClear();
    deleteNote.mockClear();
    useVaultStore.setState({
      ...useVaultStore.getState(),
      model: createDefaultModel("2026-07-08T12:00:00.000Z"),
      saveNote,
      deleteNote,
    });
  });

  afterEach(() => {
    useVaultStore.setState({
      ...useVaultStore.getState(),
      saveNote: actions.saveNote,
      deleteNote: actions.deleteNote,
    });
  });

  it("groups notes and filters by query/category", async () => {
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

    expect(screen.getByRole("heading", { name: "Work" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Personal" })).toBeVisible();
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
});
