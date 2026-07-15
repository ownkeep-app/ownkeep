import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { currentWindowLabel, setMainWindowMode } from "@/lib/window";
import { useVaultStore } from "@/stores/vault-store";
import { vaultApi } from "@/vault/api";
import { createDefaultModel, APP_VERSION } from "@/vault/model";
import type { MigrationPlan } from "@/vault/migrations";
import App from "./App";

vi.mock("@/lib/window", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/window")>();
  return {
    ...actual,
    currentWindowLabel: vi.fn(() => "main"),
    hideWindow: vi.fn(),
    setMainWindowMode: vi.fn(async () => {}),
    whenMainWindowReady: vi.fn(() => Promise.resolve()),
    mainWindowMode: vi.fn((status: string, pendingKit: unknown) =>
      status === "unlocked" && !pendingKit ? "compact" : "expanded",
    ),
  };
});

vi.mock("@/vault/api", () => ({
  vaultApi: {
    isUnlocked: vi.fn(async () => true),
    vaultExists: vi.fn(async () => true),
    vaultPath: vi.fn(async () => "/tmp/vault.dat"),
    vaultIncompatibility: vi.fn(async () => null),
    getVault: vi.fn(async () => "{}"),
    createVault: vi.fn(),
    saveVault: vi.fn(async () => {}),
    backupVault: vi.fn(async () => "/tmp/backup.dat"),
    backupVaultToChosenLocation: vi.fn(async () => "/tmp/chosen-backup.dat"),
    eraseVault: vi.fn(async () => {}),
    quitApp: vi.fn(async () => {}),
    unlock: vi.fn(async () => {}),
    unlockRecovery: vi.fn(async () => {}),
    lock: vi.fn(async () => {}),
    setAutoLock: vi.fn(async () => {}),
    setHotkeys: vi.fn(async () => {}),
    changeMaster: vi.fn(async () => {}),
    regenerateRecovery: vi.fn(),
  },
}));

const api = vi.mocked(vaultApi);
const mockLabel = vi.mocked(currentWindowLabel);
const mockSetMainWindowMode = vi.mocked(setMainWindowMode);

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
      migration: null,
      postMigrationStatus: "unlocked",
      incompatibleMessage: null,
      pendingKit: null,
      busy: false,
      error: null,
    });
  });

  it("shows the command bar on the main window when unlocked", async () => {
    render(<App />);
    expect(
      await screen.findByRole("combobox", { name: /search OwnKeep/i }),
    ).toBeInTheDocument();
    expect(mockSetMainWindowMode).toHaveBeenCalledWith("compact");
  });

  it("shows onboarding on the main window when no vault exists", async () => {
    api.isUnlocked.mockResolvedValue(false);
    api.vaultExists.mockResolvedValue(false);
    render(<App />);
    expect(
      await screen.findByRole("button", { name: /create vault/i }),
    ).toBeInTheDocument();
    expect(mockSetMainWindowMode).toHaveBeenCalledWith("expanded");
  });

  it("expands the main window on the lock screen", async () => {
    api.isUnlocked.mockResolvedValue(false);
    api.vaultExists.mockResolvedValue(true);
    render(<App />);
    expect(
      await screen.findByRole("button", { name: /unlock/i }),
    ).toBeInTheDocument();
    expect(mockSetMainWindowMode).toHaveBeenCalledWith("expanded");
  });

  it("does not resize the main window again on browser focus", async () => {
    api.isUnlocked.mockResolvedValue(false);
    api.vaultExists.mockResolvedValue(false);
    render(<App />);
    await screen.findByRole("button", { name: /create vault/i });
    mockSetMainWindowMode.mockClear();

    window.dispatchEvent(new Event("focus"));

    expect(mockSetMainWindowMode).not.toHaveBeenCalled();
  });

  it("subscribes to system theme changes when theme is set to system", async () => {
    const originalMatchMedia = window.matchMedia;
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn(() => ({
        matches: true,
        addEventListener,
        removeEventListener,
      })),
    });

    const view = render(<App />);
    await screen.findByRole("combobox", { name: /search OwnKeep/i });

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(addEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );

    view.unmount();
    expect(removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
    document.documentElement.classList.remove("dark");
  });

  it("shows the Dashboard (with its module sidebar) on the dashboard window", async () => {
    mockLabel.mockReturnValue("dashboard");
    render(<App />);
    expect(await screen.findByText("Modules")).toBeInTheDocument();
    expect(
      await screen.findByText(`OwnKeep v${APP_VERSION}`),
    ).toBeInTheDocument();
  });

  it("routes main-window reset, migration, incompatible, and Emergency Kit states", async () => {
    api.isUnlocked.mockResolvedValue(false);
    api.vaultExists.mockResolvedValue(true);
    render(<App />);
    await screen.findByRole("button", { name: /unlock/i });

    act(() => {
      useVaultStore.setState({ status: "reset" });
    });
    expect(
      screen.getByRole("heading", { name: /set a new master password/i }),
    ).toBeInTheDocument();

    act(() => {
      useVaultStore.setState({
        status: "migration",
        migration: {
          fromSchemaVersion: 1,
          toSchemaVersion: 2,
          fromAppVersion: "0.0",
          toAppVersion: "0.1",
          steps: [],
          changes: [],
          migratedModel: createDefaultModel("2026-07-07T00:00:00.000Z"),
        } satisfies MigrationPlan,
      });
    });
    expect(
      screen.getByRole("heading", { name: /upgrade vault data/i }),
    ).toBeInTheDocument();

    act(() => {
      useVaultStore.setState({
        status: "incompatible",
        incompatibleMessage: "Please upgrade OwnKeep.",
      });
    });
    expect(screen.getByText(/please upgrade OwnKeep/i)).toBeInTheDocument();

    act(() => {
      useVaultStore.setState({
        status: "unlocked",
        pendingKit: {
          app: "OwnKeep",
          recovery_code: "alpha beta",
          instructions: "Save it.",
        },
      });
    });
    expect(
      screen.getByRole("heading", { name: /your recovery code/i }),
    ).toBeInTheDocument();
  });
});
