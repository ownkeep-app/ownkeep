import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TodosListView } from "@/modules/todos/TodosModule";
import type { TodoEntry } from "@/modules/todos/types";
import { useVaultStore } from "@/stores/vault-store";
import { vaultApi } from "@/vault/api";
import { createDefaultModel } from "@/vault/model";

vi.mock("@/vault/api");

const todo: TodoEntry = {
  id: "todo-1",
  title: "Renew passport",
  notes: "",
  done: false,
  dueAt: null,
  notifyLeadMinutes: 30,
  priority: "normal",
  category: "Personal",
  recurrence: "none",
  updatedAt: "2026-07-08T00:00:00.000Z",
};

function Wrapper() {
  const model = useVaultStore((s) => s.model);
  const items = Array.isArray(model?.modules.todos) ? model.modules.todos : [];
  return <TodosListView items={items} />;
}

describe("TodosListView toggle integration", () => {
  let stored: ReturnType<typeof createDefaultModel>;

  beforeEach(() => {
    stored = createDefaultModel("2026-07-08T00:00:00.000Z");
    stored.modules.todos = [todo];
    vi.mocked(vaultApi.saveVault).mockImplementation(async (json: string) => {
      stored = JSON.parse(json);
    });
    // Stale/empty projections must not wipe the optimistic UI update after toggle.
    vi.mocked(vaultApi.getVault).mockImplementation(async () => "{}");
    useVaultStore.setState({ status: "unlocked", model: stored });
  });

  it("toggles done in the UI even when getVault returns an empty projection", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    const box = screen.getByRole("checkbox", {
      name: /toggle renew passport/i,
    });
    expect(box).toHaveAttribute("aria-checked", "false");
    await user.click(box);
    await waitFor(() => expect(box).toHaveAttribute("aria-checked", "true"));
    const savedTodos = stored.modules.todos;
    expect(Array.isArray(savedTodos) && savedTodos[0]).toMatchObject({
      id: "todo-1",
      done: true,
    });
  });
});
