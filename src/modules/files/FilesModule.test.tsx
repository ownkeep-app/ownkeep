import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toastError, toastSuccess } from "@/lib/toast";
import { useVaultStore } from "@/stores/vault-store";
import { chooseRowAction, confirmDelete } from "@/test/row-actions";
import { vaultApi } from "@/vault/api";
import { createDefaultModel, setModuleSettings } from "@/vault/model";
import { FilesListView } from "./FilesModule";
import type { FileEntry } from "./types";

vi.mock("@/lib/toast", () => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/vault/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/vault/api")>();
  return {
    ...original,
    vaultApi: { ...original.vaultApi, exportFile: vi.fn() },
  };
});

const actions = {
  importFiles: useVaultStore.getState().importFiles,
  saveFile: useVaultStore.getState().saveFile,
  deleteFile: useVaultStore.getState().deleteFile,
  reorderItems: useVaultStore.getState().reorderItems,
};

const pdf: FileEntry = {
  id: "doc",
  title: "Lab report",
  category: "Work",
  invalid: false,
  description: "Annual checkup",
  date: "2026-07-01",
  fileName: "report.pdf",
  mime: "application/pdf",
  size: 2048,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};
const clip: FileEntry = {
  ...pdf,
  id: "clip",
  title: "Holiday clip",
  category: "Personal",
  description: "",
  date: "2026-08-01",
  fileName: "holiday.mp4",
  mime: "video/mp4",
  size: 1024,
};
const archive: FileEntry = {
  ...pdf,
  id: "zip",
  title: "Old archive",
  description: "",
  date: "2020-01-01",
  fileName: "old.zip",
  mime: "application/octet-stream",
};

describe("FilesListView", () => {
  const importFiles = vi.fn();
  const saveFile = vi.fn(async () => {});
  const deleteFile = vi.fn(async () => {});
  const reorderItems = vi.fn(async () => {});
  const exportFile = vi.mocked(vaultApi.exportFile);

  beforeEach(() => {
    vi.clearAllMocks();
    useVaultStore.setState({
      model: createDefaultModel("2026-07-08T12:00:00.000Z"),
      importFiles,
      saveFile,
      deleteFile,
      reorderItems,
    });
  });

  afterEach(() => {
    useVaultStore.setState(actions);
  });

  const viewerFrame = (title: string) =>
    within(
      screen.getByRole("dialog", { name: `Preview of ${title}` }),
    ).getByTitle(title);
  const addButton = () =>
    screen.getAllByRole("button", { name: "Add files" })[0];
  const outcome = (entries: FileEntry[] = []) => ({
    entries,
    tooLarge: [],
    failed: [],
  });

  it("offers Add files when empty", async () => {
    const user = userEvent.setup();
    importFiles.mockResolvedValue(null);
    render(<FilesListView items={[]} />);

    expect(screen.getByText("No files yet")).toBeVisible();
    expect(screen.getByText("0 files")).toBeVisible();
    await user.click(screen.getAllByRole("button", { name: "Add files" })[1]);
    expect(importFiles).toHaveBeenCalledTimes(1);
  });

  it("lists files newest first with their total size", () => {
    render(<FilesListView items={[pdf, clip, archive]} />);

    const titles = screen
      .getAllByRole("listitem")
      .map((tile) => within(tile).getAllByRole("button")[2].textContent);
    expect(titles).toEqual(["Holiday clip", "Lab report", "Old archive"]);
    expect(screen.getByText(/3 files · 5\.0 KB/)).toBeVisible();
    const reportTile = screen.getByTitle("Annual checkup");
    expect(within(reportTile).getByText(/2\.0 KB$/)).toBeVisible();
    // The description stays reachable from the tile, without crowding it.
    expect(reportTile).toBeVisible();
  });

  it("sizes grid rows to their tiles, so a full pane scrolls rather than clipping them", () => {
    render(<FilesListView items={[pdf]} />);
    // jsdom has no layout, so this guards the class that the fix depends on.
    expect(screen.getByRole("list")).toHaveClass("auto-rows-max");
  });

  it("opens the preview by clicking a tile's picture", async () => {
    const user = userEvent.setup();
    render(<FilesListView items={[pdf, clip]} />);

    await user.click(
      screen.getByRole("button", { name: "Preview of Lab report" }),
    );

    expect(
      screen.getByRole("dialog", { name: "Preview of Lab report" }),
    ).toBeVisible();
    expect(screen.getByText("2 / 2")).toBeVisible();
  });

  it("opens details by clicking the picture of a file with no preview", async () => {
    const user = userEvent.setup();
    render(<FilesListView items={[archive]} />);

    await user.click(
      screen.getByRole("button", { name: "Details of Old archive" }),
    );

    expect(screen.getByRole("dialog", { name: "Old archive" })).toBeVisible();
  });

  it("filters, explains an empty result, and clears", async () => {
    const user = userEvent.setup();
    render(<FilesListView items={[pdf, clip]} />);

    await user.type(screen.getByLabelText("Filter files…"), "holiday");
    expect(screen.getByText("Holiday clip")).toBeVisible();
    expect(screen.queryByText("Lab report")).toBeNull();

    await user.clear(screen.getByLabelText("Filter files…"));
    await user.type(screen.getByLabelText("Filter files…"), "nothing");
    expect(screen.getByText("No matches")).toBeVisible();
    expect(screen.queryByText("No files yet")).toBeNull();

    await user.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(screen.getByText("Lab report")).toBeVisible();
  });

  it("filters by category, explains an empty one, and clears", async () => {
    const user = userEvent.setup();
    render(<FilesListView items={[pdf, clip]} />);
    const filter = screen.getByLabelText("Filter by category");

    await user.selectOptions(filter, "Work");
    expect(screen.getByText("Lab report")).toBeVisible();
    expect(screen.queryByText("Holiday clip")).toBeNull();

    await user.selectOptions(filter, "Finance");
    expect(screen.getByText("No files in this category.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(screen.getByText("Holiday clip")).toBeVisible();
    expect(filter).toHaveValue("");
  });

  it("shows each file's category on its tile and in details", async () => {
    const user = userEvent.setup();
    render(<FilesListView items={[pdf]} />);
    const tile = screen.getByRole("listitem");
    expect(within(tile).getByText("Work")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Lab report" }));
    const details = screen.getByRole("dialog", { name: "Lab report" });
    expect(within(details).getByText("Category")).toBeVisible();
    expect(within(details).getByText("Work")).toBeVisible();
  });

  describe("drag to sort", () => {
    const handleFor = (title: string) =>
      screen.getByRole("button", { name: `Drag to reorder ${title}` });
    const titles = () =>
      screen
        .getAllByRole("listitem")
        .map((tile) => within(tile).getAllByRole("button")[2].textContent);
    const useManualOrder = () => {
      const model = createDefaultModel("2026-07-08T12:00:00.000Z");
      useVaultStore.setState({
        model: setModuleSettings(model, "files", { manualOrder: true }),
      });
    };
    const savedIds = () =>
      (reorderItems.mock.lastCall as unknown as [string, FileEntry[]])[1].map(
        (file) => file.id,
      );

    it("first freezes the date order on screen, then applies the move", () => {
      render(<FilesListView items={[pdf, archive, clip]} />);
      expect(titles()).toEqual(["Holiday clip", "Lab report", "Old archive"]);

      fireEvent.keyDown(handleFor("Old archive"), { key: "ArrowUp" });

      expect(reorderItems).toHaveBeenCalledWith("files", expect.any(Array));
      expect(savedIds()).toEqual(["clip", "zip", "doc"]);
    });

    it("moves by dragging one tile onto another", async () => {
      render(<FilesListView items={[pdf, clip]} />);
      const [first, second] = screen.getAllByRole("listitem");
      const rect = (left: number, right: number) =>
        ({ left, right, top: 0, bottom: 100 }) as DOMRect;
      first.parentElement!.getBoundingClientRect = () => rect(0, 500);
      first.getBoundingClientRect = () => rect(0, 100);
      second.getBoundingClientRect = () => rect(120, 220);

      fireEvent.pointerDown(handleFor("Lab report"), {
        button: 0,
        pointerId: 1,
      });
      fireEvent.pointerMove(handleFor("Lab report"), {
        clientX: 50,
        clientY: 50,
        pointerId: 1,
      });
      expect(first).toHaveAttribute("data-drop-target", "true");
      expect(second).toHaveAttribute("data-dragging", "true");
      fireEvent.pointerUp(handleFor("Lab report"), { pointerId: 1 });

      await waitFor(() => expect(savedIds()).toEqual(["doc", "clip"]));
    });

    it("shows the saved order once hand-sorted, ignoring dates", () => {
      useManualOrder();
      render(<FilesListView items={[archive, pdf, clip]} />);
      expect(titles()).toEqual(["Old archive", "Lab report", "Holiday clip"]);
    });

    it("keeps hidden files in place when sorting under a filter", async () => {
      useManualOrder();
      const user = userEvent.setup();
      const other = { ...clip, id: "other", title: "Other", category: "Work" };
      render(<FilesListView items={[pdf, clip, other]} />);

      await user.selectOptions(
        screen.getByLabelText("Filter by category"),
        "Work",
      );
      fireEvent.keyDown(handleFor("Other"), { key: "ArrowUp" });

      expect(savedIds()).toEqual(["other", "doc", "clip"]);
    });

    it("reports a failed save", async () => {
      reorderItems.mockRejectedValueOnce(new Error("disk full"));
      render(<FilesListView items={[pdf, clip]} />);

      fireEvent.keyDown(handleFor("Lab report"), { key: "ArrowUp" });

      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith("Couldn't save the new order."),
      );
    });
  });

  describe("invalid files", () => {
    const expired = { ...pdf, id: "old", title: "Expired ID", invalid: true };
    const expired2 = { ...clip, id: "old2", title: "Old pass", invalid: true };
    const toggle = () => screen.getByRole("button", { name: "Invalid (2)" });

    it("keeps them out of the main list, in a section collapsed by default", async () => {
      const user = userEvent.setup();
      render(<FilesListView items={[pdf, expired, expired2]} />);

      expect(screen.getByText("Lab report")).toBeVisible();
      expect(screen.queryByText("Expired ID")).toBeNull();
      expect(toggle()).toHaveAttribute("aria-expanded", "false");

      await user.click(toggle());

      expect(toggle()).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText("Expired ID")).toBeVisible();
      expect(screen.getByText("Old pass")).toBeVisible();

      await user.click(toggle());
      expect(screen.queryByText("Expired ID")).toBeNull();
    });

    it("shows no section when no file is invalid", () => {
      render(<FilesListView items={[pdf]} />);
      expect(screen.queryByRole("button", { name: /^Invalid/ })).toBeNull();
    });

    it("still lists a library that is entirely invalid", () => {
      render(<FilesListView items={[expired, expired2]} />);
      expect(toggle()).toBeVisible();
      expect(screen.queryByText("No files yet")).toBeNull();
    });

    it("applies filters to the section and its count", async () => {
      const user = userEvent.setup();
      render(<FilesListView items={[pdf, expired, expired2]} />);

      await user.type(screen.getByLabelText("Filter files…"), "pass");

      expect(screen.getByRole("button", { name: "Invalid (1)" })).toBeVisible();
    });

    it("stamps previews, sorts only within the section, and previews only its files", async () => {
      const user = userEvent.setup();
      render(<FilesListView items={[pdf, expired, expired2]} />);
      await user.click(toggle());

      expect(screen.getAllByText("Invalid")).toHaveLength(2);

      fireEvent.keyDown(
        screen.getByRole("button", { name: "Drag to reorder Expired ID" }),
        { key: "ArrowUp" },
      );
      const moved = (
        reorderItems.mock.lastCall as unknown as [string, FileEntry[]]
      )[1].map((file) => file.id);
      expect(moved.indexOf("old")).toBeLessThan(moved.indexOf("old2"));
      expect(moved).toContain("doc");

      await user.click(
        screen.getByRole("button", { name: "Preview of Expired ID" }),
      );
      const viewer = screen.getByRole("dialog", {
        name: "Preview of Expired ID",
      });
      expect(within(viewer).getByText("2 / 2")).toBeVisible();
    });

    it("marks a file invalid from its edit form", async () => {
      const user = userEvent.setup();
      render(<FilesListView items={[pdf]} />);

      await chooseRowAction(user, "Lab report", "Edit");
      const field = screen.getByRole("switch", { name: "File is invalid" });
      expect(field).toHaveAttribute("aria-checked", "false");
      await user.click(field);
      await user.click(screen.getByRole("button", { name: /save/i }));

      await waitFor(() =>
        expect(saveFile).toHaveBeenCalledWith(
          expect.objectContaining({ id: "doc", invalid: true }),
        ),
      );
    });

    it("says so in details", async () => {
      const user = userEvent.setup();
      render(<FilesListView items={[expired, expired2]} />);
      await user.click(toggle());

      await user.click(screen.getByRole("button", { name: "Expired ID" }));

      const details = screen.getByRole("dialog", { name: "Expired ID" });
      expect(within(details).getByText("Status")).toBeVisible();
    });

    it("doesn't mention status for a valid file", async () => {
      const user = userEvent.setup();
      render(<FilesListView items={[pdf]} />);
      await user.click(screen.getByRole("button", { name: "Lab report" }));
      expect(screen.queryByText("Status")).toBeNull();
    });
  });

  describe("pagination", () => {
    const many = (count: number, extra = {}) =>
      Array.from({ length: count }, (_, index) => ({
        ...clip,
        id: `f${index}`,
        title: `File ${index}`,
        date: `2026-01-${String(28 - (index % 28)).padStart(2, "0")}`,
        ...extra,
      }));
    const tileCount = () => screen.getAllByRole("listitem").length;

    it("isn't shown while everything fits on one page", () => {
      render(<FilesListView items={many(24)} />);
      expect(tileCount()).toBe(24);
      expect(screen.queryByRole("navigation", { name: "Pages" })).toBeNull();
    });

    it("shows one page at a time and moves between them", async () => {
      const user = userEvent.setup();
      render(<FilesListView items={many(30)} />);

      expect(tileCount()).toBe(24);
      expect(screen.getByText("1–24 of 30")).toBeVisible();

      await user.click(screen.getByRole("button", { name: "Page 2" }));

      expect(tileCount()).toBe(6);
      expect(screen.getByText("25–30 of 30")).toBeVisible();
    });

    it("goes back to the first page when a filter changes", async () => {
      const user = userEvent.setup();
      render(<FilesListView items={many(30)} />);
      await user.click(screen.getByRole("button", { name: "Page 2" }));

      await user.type(screen.getByLabelText("Filter files…"), "File");

      expect(screen.getByText("1–24 of 30")).toBeVisible();
    });

    it("lands on the last page left when the current one empties", async () => {
      const user = userEvent.setup();
      const items = many(25);
      const { rerender } = render(<FilesListView items={items} />);
      await user.click(screen.getByRole("button", { name: "Page 2" }));
      expect(tileCount()).toBe(1);

      rerender(<FilesListView items={items.slice(0, 24)} />);

      expect(tileCount()).toBe(24);
    });

    it("counts only valid files, leaving invalid ones in their section", () => {
      render(
        <FilesListView
          items={[...many(24), ...many(5, { id: "x", invalid: true })].map(
            (file, index) => ({ ...file, id: `file-${index}` }),
          )}
        />,
      );
      expect(tileCount()).toBe(24);
      expect(screen.queryByRole("navigation", { name: "Pages" })).toBeNull();
      expect(screen.getByRole("button", { name: "Invalid (5)" })).toBeVisible();
    });

    it("previews across every page, not just this one", async () => {
      const user = userEvent.setup();
      render(<FilesListView items={many(30)} />);

      await user.click(
        screen.getAllByRole("button", { name: /^Preview of File/ })[0],
      );

      expect(screen.getByText("1 / 30")).toBeVisible();
    });

    it("returns to the first page after adding files", async () => {
      const user = userEvent.setup();
      importFiles.mockResolvedValue(outcome([clip, pdf]));
      render(<FilesListView items={many(30)} />);
      await user.click(screen.getByRole("button", { name: "Page 2" }));

      await user.click(addButton());

      await waitFor(() => expect(screen.getByText("1–24 of 30")).toBeVisible());
    });
  });

  it("opens a single added file's details for editing", async () => {
    const user = userEvent.setup();
    importFiles.mockResolvedValue(outcome([pdf]));
    render(<FilesListView items={[]} />);

    await user.click(addButton());

    expect(await screen.findByLabelText("File title")).toHaveValue(
      "Lab report",
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("confirms a batch without opening a form", async () => {
    const user = userEvent.setup();
    importFiles.mockResolvedValue(outcome([pdf, clip]));
    render(<FilesListView items={[]} />);

    await user.click(addButton());

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Added 2 files"),
    );
    expect(screen.queryByLabelText("File title")).toBeNull();
  });

  it("does nothing when the picker is dismissed", async () => {
    const user = userEvent.setup();
    importFiles.mockResolvedValue(null);
    render(<FilesListView items={[]} />);

    await user.click(addButton());

    await waitFor(() => expect(importFiles).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("reports files skipped for size, failures and import errors", async () => {
    const user = userEvent.setup();
    importFiles.mockResolvedValueOnce({
      entries: [],
      tooLarge: ["huge.iso", "big.mov"],
      failed: [{ fileName: "bad.bin", error: "denied" }],
    });
    render(<FilesListView items={[]} />);

    await user.click(addButton());
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Over your maximum file size, so not added: huge.iso, big.mov",
      ),
    );
    expect(toastError).toHaveBeenCalledWith("Couldn't add bad.bin: denied");

    importFiles.mockRejectedValueOnce("transfer busy");
    await user.click(addButton());
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("transfer busy"),
    );
  });

  it("edits title, description and date", async () => {
    const user = userEvent.setup();
    render(<FilesListView items={[pdf]} />);

    await chooseRowAction(user, "Lab report", "Edit");
    await user.clear(screen.getByLabelText("File title"));
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByText("Title is required.")).toBeVisible();
    expect(saveFile).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("File title"), "Renamed");
    await user.clear(screen.getByLabelText("File description"));
    await user.type(screen.getByLabelText("File description"), "New notes");
    await user.selectOptions(screen.getByLabelText("File category"), "Finance");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(saveFile).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "doc",
          title: "Renamed",
          category: "Finance",
          description: "New notes",
          date: "2026-07-01",
          fileName: "report.pdf",
        }),
      ),
    );
    expect(await screen.findByText("Lab report")).toBeVisible();
  });

  it("cancels an edit without saving", async () => {
    const user = userEvent.setup();
    render(<FilesListView items={[pdf]} />);

    await chooseRowAction(user, "Lab report", "Edit");
    await user.click(screen.getAllByRole("button", { name: "Cancel" })[0]);

    expect(saveFile).not.toHaveBeenCalled();
    expect(screen.getByText("Lab report")).toBeVisible();
  });

  it("shows details and previews from them", async () => {
    const user = userEvent.setup();
    render(<FilesListView items={[pdf]} />);

    await user.click(screen.getByRole("button", { name: "Lab report" }));
    const details = screen.getByRole("dialog", { name: "Lab report" });
    expect(within(details).getByText("report.pdf")).toBeVisible();
    expect(within(details).getByText("Annual checkup")).toBeVisible();
    expect(within(details).getByText("2.0 KB")).toBeVisible();

    await user.click(within(details).getByRole("button", { name: "Preview" }));
    expect(viewerFrame("Lab report")).toBeVisible();
  });

  it("shows a placeholder for an empty description", async () => {
    const user = userEvent.setup();
    render(<FilesListView items={[clip]} />);
    await chooseRowAction(user, "Holiday clip", "Details");
    expect(screen.getByText("Empty")).toBeVisible();
  });

  it("goes from details to the edit form", async () => {
    const user = userEvent.setup();
    render(<FilesListView items={[pdf]} />);

    await user.click(screen.getByRole("button", { name: "Lab report" }));
    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("File title")).toHaveValue("Lab report");
  });

  it("offers no preview for an opaque file", async () => {
    const user = userEvent.setup();
    render(<FilesListView items={[archive]} />);

    await user.click(
      screen.getByRole("button", { name: /actions for old archive/i }),
    );
    expect(screen.queryByRole("menuitem", { name: "Preview" })).toBeNull();
    await user.click(screen.getByRole("menuitem", { name: "Details" }));
    expect(screen.queryByRole("button", { name: "Preview" })).toBeNull();
  });

  it("previews from the row menu and steps through previewable files only", async () => {
    const user = userEvent.setup();
    render(<FilesListView items={[pdf, clip, archive]} />);

    await chooseRowAction(user, "Lab report", "Preview");

    expect(screen.getByText("2 / 2")).toBeVisible();
    expect(viewerFrame("Lab report")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(
      screen.queryByRole("dialog", { name: "Preview of Lab report" }),
    ).toBeNull();
  });

  it("opens a focused item, and can preview it even if a filter hides it", async () => {
    const user = userEvent.setup();
    const handled = vi.fn();
    const { rerender } = render(<FilesListView items={[pdf, clip]} />);

    await user.type(screen.getByLabelText("Filter files…"), "holiday");
    rerender(
      <FilesListView
        focusItemId="doc"
        items={[pdf, clip]}
        onFocusItemHandled={handled}
      />,
    );

    expect(handled).toHaveBeenCalled();
    const details = screen.getByRole("dialog", { name: "Lab report" });
    await user.click(within(details).getByRole("button", { name: "Preview" }));
    expect(viewerFrame("Lab report")).toBeVisible();
    expect(screen.queryByText("1 / 2")).toBeNull();
  });

  it("ignores a focus request for an unknown file", () => {
    const handled = vi.fn();
    render(
      <FilesListView
        focusItemId="missing"
        items={[pdf]}
        onFocusItemHandled={handled}
      />,
    );
    expect(handled).not.toHaveBeenCalled();
  });

  it("saves a copy, staying quiet if canceled and reporting failures", async () => {
    const user = userEvent.setup();
    render(<FilesListView items={[pdf]} />);

    exportFile.mockResolvedValueOnce("/Users/me/report.pdf");
    await chooseRowAction(user, "Lab report", "Save a copy");
    expect(exportFile).toHaveBeenCalledWith("doc", "report.pdf");
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        "Saved to /Users/me/report.pdf",
      ),
    );

    vi.mocked(toastSuccess).mockClear();
    exportFile.mockResolvedValueOnce(null);
    await chooseRowAction(user, "Lab report", "Save a copy");
    await waitFor(() => expect(exportFile).toHaveBeenCalledTimes(2));
    expect(toastSuccess).not.toHaveBeenCalled();

    exportFile.mockRejectedValueOnce("disk full");
    await chooseRowAction(user, "Lab report", "Save a copy");
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("disk full"));
  });

  it("saves a copy from details and from the viewer", async () => {
    const user = userEvent.setup();
    exportFile.mockResolvedValue(null);
    render(<FilesListView items={[pdf]} />);

    await user.click(screen.getByRole("button", { name: "Lab report" }));
    const details = screen.getByRole("dialog", { name: "Lab report" });
    await user.click(
      within(details).getByRole("button", { name: "Save a copy" }),
    );
    expect(exportFile).toHaveBeenCalledTimes(1);

    await user.click(within(details).getByRole("button", { name: "Preview" }));
    const viewer = screen.getByRole("dialog", {
      name: "Preview of Lab report",
    });
    await user.click(
      within(viewer).getByRole("button", { name: "Save a copy" }),
    );
    expect(exportFile).toHaveBeenCalledTimes(2);
  });

  it("deletes after confirmation, closing its details", async () => {
    const user = userEvent.setup();
    render(<FilesListView items={[pdf, clip]} />);

    await user.click(screen.getByRole("button", { name: "Lab report" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await confirmDelete(user);

    await waitFor(() => expect(deleteFile).toHaveBeenCalledWith("doc"));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Lab report" })).toBeNull(),
    );
  });

  it("deletes from the row menu, leaving other details alone", async () => {
    const user = userEvent.setup();
    render(<FilesListView items={[pdf]} />);

    await chooseRowAction(user, "Lab report", "Delete");
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: /cancel/i,
      }),
    );
    expect(deleteFile).not.toHaveBeenCalled();

    await chooseRowAction(user, "Lab report", "Delete");
    await confirmDelete(user);
    await waitFor(() => expect(deleteFile).toHaveBeenCalledWith("doc"));
  });
});
