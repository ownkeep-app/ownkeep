import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { currentWindowLabel } from "@/lib/window";
import { useVaultStore } from "@/stores/vault-store";
import { vaultApi } from "@/vault/api";
import App from "./App";

vi.mock("@/lib/window", () => ({
  currentWindowLabel: vi.fn(() => "main"),
  hideWindow: vi.fn(),
}));

vi.mock("@/vault/api", () => ({
  vaultApi: {
    isUnlocked: vi.fn(async () => true),
    vaultExists: vi.fn(async () => true),
    getVault: vi.fn(async () => "{}"),
    createVault: vi.fn(),
    saveVault: vi.fn(async () => {}),
    unlock: vi.fn(async () => {}),
    unlockRecovery: vi.fn(async () => {}),
    lock: vi.fn(async () => {}),
    changeMaster: vi.fn(async () => {}),
    regenerateRecovery: vi.fn(),
  },
}));

const api = vi.mocked(vaultApi);
const mockLabel = vi.mocked(currentWindowLabel);

describe("App routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLabel.mockReturnValue("main");
    api.isUnlocked.mockResolvedValue(true);
    api.vaultExists.mockResolvedValue(true);
    api.getVault.mockResolvedValue("{}");
    useVaultStore.setState({
      status: "loading",
      model: null,
      pendingKit: null,
      busy: false,
      error: null,
    });
  });

  it("shows the command bar on the main window when unlocked", async () => {
    render(<App />);
    expect(
      await screen.findByRole("combobox", { name: /search keystash/i }),
    ).toBeInTheDocument();
  });

  it("shows onboarding on the main window when no vault exists", async () => {
    api.isUnlocked.mockResolvedValue(false);
    api.vaultExists.mockResolvedValue(false);
    render(<App />);
    expect(
      await screen.findByRole("button", { name: /create vault/i }),
    ).toBeInTheDocument();
  });

  it("shows the Dashboard (with its module sidebar) on the dashboard window", async () => {
    mockLabel.mockReturnValue("dashboard");
    render(<App />);
    expect(await screen.findByText("Modules")).toBeInTheDocument();
  });
});
