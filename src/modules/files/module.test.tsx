import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { filesModule } from "./module";
import type { FileEntry } from "./types";

const file: FileEntry = {
  id: "blob-1",
  title: "Lab report",
  category: "Personal",
  invalid: false,
  description: "",
  date: "2026-07-01",
  fileName: "report.pdf",
  mime: "application/pdf",
  size: 10,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

describe("filesModule surface", () => {
  it("is Dashboard-first with its own scope and settings", () => {
    expect(filesModule.id).toBe("files");
    expect(filesModule.searchableByDefault).toBe(false);
    expect(filesModule.scopePrefix).toBe("fi");
    expect(filesModule.createEmpty()).toEqual([]);
    expect(filesModule.SettingsPanel).toBeDefined();
  });

  it("indexes and lists only valid entries", () => {
    expect(filesModule.buildIndex([file, { junk: true }])).toHaveLength(1);
    render(<filesModule.ListView items={[file, { junk: true }]} />);
    expect(screen.getByRole("heading", { name: "Files" })).toBeVisible();
    expect(screen.getByText("Lab report")).toBeVisible();
    expect(screen.getByText(/1 file/)).toBeVisible();
  });
});
