import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MODULES } from "@/modules/registry";
import { TODOS_MODULE_ID } from "@/modules/todos/types";
import { useVaultStore } from "@/stores/vault-store";
import { vaultApi } from "@/vault/api";
import { createDefaultModel, ensureModuleDefaults } from "@/vault/model";
import { Dashboard } from "./Dashboard";

vi.mock("@/vault/api", () => ({
  vaultApi: {
    lock: vi.fn(async () => {}),
  },
}));

vi.mock("@/lib/window", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/window")>();
  return {
    ...actual,
    takeDashboardModule: vi.fn(async () => null),
  };
});

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

const api = vi.mocked(vaultApi);

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useVaultStore.setState({
      status: "unlocked",
      model: ensureModuleDefaults(
        createDefaultModel("2026-07-07T00:00:00.000Z"),
        MODULES,
      ),
      migration: null,
      postMigrationStatus: "unlocked",
      incompatibleMessage: null,
      pendingKit: null,
      busy: false,
      error: null,
    });
  });

  it("shows the unlock form when the vault is locked", () => {
    useVaultStore.setState({ status: "locked", model: null });

    render(<Dashboard />);

    expect(screen.getByLabelText("Master password")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^unlock$/i }),
    ).toBeInTheDocument();
  });

  it("renders the first enabled module by default and switches panes by click", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    expect(screen.getByRole("heading", { name: "Passwords" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: /commands/i }));

    expect(
      screen.getByRole("heading", { name: "Commands" }),
    ).toBeInTheDocument();
  });

  it("selects a module pane requested by the command-bar bridge", async () => {
    const { takeDashboardModule } = await import("@/lib/window");
    vi.mocked(takeDashboardModule).mockResolvedValueOnce(TODOS_MODULE_ID);

    render(<Dashboard />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Todos" })).toBeVisible(),
    );
  });

  it("switches panes when the dashboard-open-module event fires", async () => {
    const { listen } = await import("@tauri-apps/api/event");
    let handler: ((event: { payload: string }) => void) | undefined;
    vi.mocked(listen).mockImplementationOnce(async (_event, callback) => {
      handler = callback as (event: { payload: string }) => void;
      return () => {};
    });

    render(<Dashboard />);

    await waitFor(() => expect(handler).toBeDefined());
    handler?.({ payload: TODOS_MODULE_ID });

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Todos" })).toBeVisible(),
    );
  });

  it("supports numbered and arrow-key sidebar navigation outside text inputs", () => {
    render(<Dashboard />);

    // Start with arrow navigation while nothing is selected (covers the default-row branch).
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(
      screen.getByRole("heading", { name: "Commands" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { code: "Digit2", altKey: true, shiftKey: true });
    expect(
      screen.getByRole("heading", { name: "Commands" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByRole("heading", { name: "Todos" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(
      screen.getByRole("heading", { name: "Commands" }),
    ).toBeInTheDocument();

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(
      screen.getByRole("heading", { name: "Commands" }),
    ).toBeInTheDocument();
    input.remove();
  });

  it("falls back to Settings when no modules are enabled", () => {
    const model = ensureModuleDefaults(
      createDefaultModel("2026-07-07T00:00:00.000Z"),
      MODULES,
    );
    useVaultStore.setState({
      model: {
        ...model,
        settings: {
          ...model.settings,
          modules: Object.fromEntries(
            MODULES.map((module) => [
              module.id,
              { enabled: false, searchable: false },
            ]),
          ),
        },
      },
    });

    render(<Dashboard />);

    expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  it("renders the finance module pane with its empty state", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(screen.getByRole("button", { name: /finance/i }));

    expect(screen.getByRole("heading", { name: "Finance" })).toBeVisible();
    expect(screen.getByText(/no snapshots yet/i)).toBeVisible();
  });

  it("locks the vault from the sidebar", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(screen.getByRole("button", { name: /lock/i }));

    expect(api.lock).toHaveBeenCalled();
    expect(useVaultStore.getState().status).toBe("locked");
  });

  it("opens keyboard help from the sidebar Help row", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    expect(
      screen.queryByRole("dialog", { name: "Keyboard shortcuts" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Keyboard shortcuts" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /help/i }));

    await waitFor(() =>
      expect(
        screen.getByRole("dialog", { name: "Keyboard shortcuts" }),
      ).toBeVisible(),
    );
  });
});
