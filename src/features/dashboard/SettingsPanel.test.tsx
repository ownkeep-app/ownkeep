import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useVaultStore } from "@/stores/vault-store";
import { vaultApi } from "@/vault/api";
import { createDefaultModel } from "@/vault/model";
import { SettingsPanel } from "./SettingsPanel";

vi.mock("@/vault/api", () => ({
  vaultApi: {
    saveVault: vi.fn(async () => {}),
    setAutoLock: vi.fn(async () => {}),
  },
}));

const api = vi.mocked(vaultApi);

describe("SettingsPanel auto-lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useVaultStore.setState({
      status: "unlocked",
      model: createDefaultModel("2026-07-07T00:00:00.000Z"),
      migration: null,
      postMigrationStatus: "unlocked",
      incompatibleMessage: null,
      pendingKit: null,
      busy: false,
      error: null,
    });
  });

  it("shows the current timeout and offers a Never option", () => {
    render(<SettingsPanel />);
    const select = screen.getByLabelText(
      "Auto-lock timeout",
    ) as HTMLSelectElement;
    expect(select.value).toBe("60"); // createDefaultModel default → 1 hour
    expect(screen.getByRole("option", { name: "Never" })).toBeInTheDocument();
  });

  it("persists a changed timeout and pushes it to the Rust session", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.selectOptions(screen.getByLabelText("Auto-lock timeout"), "0");

    const saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.settings.autoLockMinutes).toBe(0);
    expect(api.setAutoLock).toHaveBeenCalledWith(0);
  });
});
