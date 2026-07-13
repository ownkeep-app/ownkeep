import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { commandsModule } from "./module";
import type { CommandEntry } from "./types";

vi.mock("shiki", () => ({
  codeToTokens: vi.fn(async (code: string) => ({
    tokens: String(code)
      .split("\n")
      .map((line, index) => [
        { content: line, offset: index, color: "#fff", fontStyle: 0 },
      ]),
    fg: "#e1e4e8",
    bg: "#24292e",
    themeName: "github-dark",
  })),
}));

// The registry types these views as optional; the commands module always provides them.
const DetailView = commandsModule.DetailView!;
const EditView = commandsModule.EditView!;

describe("commandsModule surface", () => {
  it("returns null for non-command items in the DetailView", () => {
    const { container } = render(<DetailView item={{ not: "a command" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("treats non-command edit items as create mode", () => {
    render(
      <EditView
        item={{ not: "a command" }}
        onCancel={() => {}}
        onSave={() => {}}
      />,
    );
    expect(screen.getByRole("heading", { name: /new command/i })).toBeVisible();
  });

  it("builds a command index entry", () => {
    const entry: CommandEntry = {
      id: "c1",
      category: "git",
      title: "Status",
      description: "",
      snippets: [],
      primaryCopyTemplate: "git status",
      arguments: [],
      tags: [],
      updatedAt: "2026-07-07T00:00:00.000Z",
    };
    expect(commandsModule.buildIndex([entry])[0]).toEqual(
      expect.objectContaining({
        id: "c1",
        moduleId: "commands",
        type: "command",
      }),
    );
  });

  it("renders the ListView for valid items", () => {
    render(<commandsModule.ListView items={[]} />);
    expect(
      screen.getByRole("heading", { name: "Commands" }),
    ).toBeInTheDocument();
  });

  it("renders the detail and edit views for valid command items", () => {
    const entry: CommandEntry = {
      id: "c1",
      category: "git",
      title: "Status",
      description: "d",
      snippets: [{ language: "bash", code: "git status" }],
      primaryCopyTemplate: "git status",
      arguments: [],
      tags: [],
      updatedAt: "2026-07-07T00:00:00.000Z",
    };
    const detail = render(<DetailView item={entry} />);
    expect(screen.getByRole("heading", { name: "Status" })).toBeInTheDocument();
    detail.unmount();

    render(<EditView item={entry} onCancel={() => {}} onSave={() => {}} />);
    expect(
      screen.getByRole("heading", { name: /edit command/i }),
    ).toBeInTheDocument();
  });
});
