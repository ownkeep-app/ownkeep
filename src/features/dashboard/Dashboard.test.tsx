import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MODULES } from "@/modules/registry";
import { useVaultStore } from "@/stores/vault-store";
import { vaultApi } from "@/vault/api";
import { createDefaultModel, ensureModuleDefaults } from "@/vault/model";
import { Dashboard } from "./Dashboard";

vi.mock("@/vault/api", () => ({
  vaultApi: {
    lock: vi.fn(async () => {}),
  },
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

  it("shows a locked message when the vault is not available", () => {
    useVaultStore.setState({ status: "locked", model: null });

    render(<Dashboard />);

    expect(screen.getByText(/keystash is locked/i)).toBeInTheDocument();
  });

  it("renders the first enabled module by default and switches panes by click", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    expect(screen.getByRole("heading", { name: "Passwords" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: /commands/i }));

    expect(screen.getByText("Command library")).toBeInTheDocument();
  });

  it("supports numbered and arrow-key sidebar navigation outside text inputs", () => {
    render(<Dashboard />);

    // Start with arrow navigation while nothing is selected (covers the default-row branch).
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByText("Command library")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "2", metaKey: true });
    expect(screen.getByText("Command library")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByText(/phase 8/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(screen.getByText("Command library")).toBeInTheDocument();

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByText("Command library")).toBeInTheDocument();
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
            MODULES.map((module) => [module.id, { enabled: false }]),
          ),
        },
      },
    });

    render(<Dashboard />);

    expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  it("renders object-shaped module slices as empty lists", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(screen.getByRole("button", { name: /finance/i }));

    expect(screen.getByText(/phase 10/i)).toBeVisible();
  });

  it("locks the vault from the sidebar", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(screen.getByRole("button", { name: /lock/i }));

    expect(api.lock).toHaveBeenCalled();
    expect(useVaultStore.getState().status).toBe("locked");
  });
});
