import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { notesModule } from "./module";
import type { NoteEntry } from "./types";

const DetailView = notesModule.DetailView!;
const EditView = notesModule.EditView!;

const note: NoteEntry = {
  id: "note-1",
  name: "Shipping checklist",
  createdAt: "2026-07-01T10:00:00.000Z",
  updatedAt: "2026-07-08T11:00:00.000Z",
  category: "Work",
  content: "# Ship",
};

describe("notesModule surface", () => {
  it("returns null for non-note items in the DetailView", () => {
    const { container } = render(
      <DetailView item={{ not: "a note" }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("treats non-note edit items as create mode", () => {
    render(
      <EditView item={{ bad: true }} onCancel={() => {}} onSave={() => {}} />,
    );
    expect(
      screen.getByRole("heading", { name: /new note/i }),
    ).toBeVisible();
  });

  it("builds index entries and renders list/detail/edit surfaces", () => {
    expect(notesModule.buildIndex([note])[0]).toEqual(
      expect.objectContaining({
        moduleId: "notes",
        type: "note",
      }),
    );
    const { unmount: unmountList } = render(
      <notesModule.ListView items={[note]} />,
    );
    expect(
      screen.getByRole("heading", { name: "Notes" }),
    ).toBeVisible();
    unmountList();

    const detail = render(<DetailView item={note} />);
    expect(detail.getByRole("heading", { level: 1 })).toHaveTextContent("Ship");
    detail.unmount();

    render(<EditView item={note} onCancel={() => {}} onSave={() => {}} />);
    expect(
      screen.getByRole("heading", { name: /edit note/i }),
    ).toBeVisible();
  });
});
