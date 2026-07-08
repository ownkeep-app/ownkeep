import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { todosModule } from "./module";
import type { TodoEntry } from "./types";

const DetailView = todosModule.DetailView!;
const EditView = todosModule.EditView!;

const todo: TodoEntry = {
  id: "todo-1",
  title: "Renew passport",
  notes: "",
  done: false,
  dueAt: null,
  notifyLeadMinutes: 30,
  priority: "normal",
  tags: [],
  recurrence: "none",
  updatedAt: "2026-07-08T12:00:00.000Z",
};

describe("todosModule surface", () => {
  it("returns null for non-todo items in the DetailView", () => {
    const { container } = render(<DetailView item={{ not: "a todo" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("treats non-todo edit items as create mode", () => {
    render(
      <EditView item={{ nope: true }} onCancel={() => {}} onSave={() => {}} />,
    );
    expect(screen.getByRole("heading", { name: /new todo/i })).toBeVisible();
  });

  it("builds index entries and renders its views", () => {
    expect(todosModule.buildIndex([todo])[0]).toEqual(
      expect.objectContaining({
        id: "todo-1",
        moduleId: "todos",
        type: "todo",
      }),
    );

    const list = render(<todosModule.ListView items={[todo]} />);
    expect(screen.getByRole("heading", { name: "Todos" })).toBeVisible();
    list.unmount();

    const detail = render(<DetailView item={todo} />);
    expect(
      screen.getByRole("heading", { name: "Renew passport" }),
    ).toBeVisible();
    detail.unmount();

    render(<EditView item={todo} onCancel={() => {}} onSave={() => {}} />);
    expect(screen.getByRole("heading", { name: /edit todo/i })).toBeVisible();
  });
});
