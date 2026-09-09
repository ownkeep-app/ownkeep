import { describe, expect, it } from "vitest";

import {
  buildNoteIndex,
  createNoteEntry,
  emptyNoteForm,
  formFromNote,
  groupNotesByCategory,
  noteEntries,
  notePreview,
  sortNotesByUpdated,
  updateNoteEntry,
  validateNoteInput,
} from "./logic";
import type { NoteEntry } from "./types";

const NOW = "2026-07-08T12:00:00.000Z";

function note(overrides: Partial<NoteEntry> = {}): NoteEntry {
  return {
    id: "note-1",
    name: "Shipping checklist",
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-08T11:00:00.000Z",
    category: "Work",
    content: "# Ship\n\n- [ ] Tag release",
    ...overrides,
  };
}

describe("notes module logic", () => {
  it("builds searchable note index entries", () => {
    expect(buildNoteIndex([note()])[0]).toEqual(
      expect.objectContaining({
        id: "note-1",
        moduleId: "notes",
        type: "note",
        displayLine: "Shipping checklist — Work",
      }),
    );
    expect(buildNoteIndex([note()])[0].searchString).toContain("Ship");
  });

  it("groups by category and sorts by updatedAt descending", () => {
    const items = [
      note({
        id: "old",
        name: "Old",
        category: "Personal",
        updatedAt: "2026-07-01T00:00:00.000Z",
      }),
      note({
        id: "new-work",
        name: "New work",
        category: "Work",
        updatedAt: "2026-07-08T12:00:00.000Z",
      }),
      note({
        id: "mid-work",
        name: "Mid work",
        category: "Work",
        updatedAt: "2026-07-05T00:00:00.000Z",
      }),
    ];

    expect(sortNotesByUpdated(items).map((item) => item.id)).toEqual([
      "new-work",
      "mid-work",
      "old",
    ]);
    expect(
      groupNotesByCategory(items).map((group) => [
        group.category,
        group.notes.map((item) => item.id),
      ]),
    ).toEqual([
      ["Work", ["new-work", "mid-work"]],
      ["Personal", ["old"]],
    ]);
  });

  it("creates, updates, and validates notes", () => {
    const created = createNoteEntry(
      {
        ...emptyNoteForm(),
        name: "  Ideas  ",
        category: "Personal",
        content: "Hello **world**",
      },
      NOW,
      "note-new",
    );
    expect(created).toEqual(
      expect.objectContaining({
        id: "note-new",
        name: "Ideas",
        createdAt: NOW,
        updatedAt: NOW,
        content: "Hello **world**",
      }),
    );

    const updated = updateNoteEntry(
      created,
      { ...formFromNote(created), name: "Renamed", content: "# Hi" },
      "2026-07-09T00:00:00.000Z",
    );
    expect(updated.name).toBe("Renamed");
    expect(updated.createdAt).toBe(NOW);
    expect(updated.updatedAt).toBe("2026-07-09T00:00:00.000Z");

    expect(validateNoteInput(emptyNoteForm())).toMatch(/name/i);
    expect(
      validateNoteInput({ name: "X", category: "", content: "" }),
    ).toMatch(/category/i);
    expect(noteEntries([note(), null, { id: "bad" }])).toEqual([note()]);
    expect(notePreview("# Title\n\nSome **bold** text")).toBe("Title Some bold text");
  });
});
