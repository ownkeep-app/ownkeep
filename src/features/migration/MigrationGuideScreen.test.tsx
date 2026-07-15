import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useVaultStore } from "@/stores/vault-store";
import { createDefaultModel } from "@/vault/model";
import type { MigrationPlan } from "@/vault/migrations";
import { vaultApi } from "@/vault/api";
import {
  IncompatibleVaultScreen,
  MigrationGuideScreen,
} from "./MigrationGuideScreen";

vi.mock("@/vault/api", () => ({
  vaultApi: {
    backupVault: vi.fn(async () => "/tmp/backup.dat"),
    backupVaultToChosenLocation: vi.fn(async () => "/tmp/chosen-backup.dat"),
    saveVault: vi.fn(async () => {}),
    setAutoLock: vi.fn(async () => {}),
    setHotkeys: vi.fn(async () => {}),
    eraseVault: vi.fn(async () => {}),
    quitApp: vi.fn(async () => {}),
  },
}));

const api = vi.mocked(vaultApi);

const plan: MigrationPlan = {
  fromSchemaVersion: 1,
  toSchemaVersion: 2,
  fromAppVersion: "0.1",
  toAppVersion: "0.2",
  steps: [],
  migratedModel: createDefaultModel("2026-07-07T00:00:00.000Z"),
  changes: [
    {
      kind: "added",
      path: "settings.dashboardHotkey",
      note: "Adds the Dashboard hotkey.",
    },
    {
      kind: "renamed",
      path: "settings.oldName",
      newPath: "settings.newName",
      note: "Keeps the old value under a clearer name.",
    },
    {
      kind: "removed",
      path: "settings.legacy",
      note: "This value is no longer used and will be removed.",
      dataLoss: true,
    },
  ],
};

describe("MigrationGuideScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useVaultStore.setState({
      status: "migration",
      model: plan.migratedModel,
      migration: plan,
      postMigrationStatus: "unlocked",
      incompatibleMessage: null,
      pendingKit: null,
      busy: false,
      error: null,
    });
  });

  it("renders grouped guide entries including rename paths and red data-loss removals", () => {
    render(<MigrationGuideScreen />);

    expect(
      screen.getByRole("heading", { name: /upgrade vault data/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("settings.dashboardHotkey")).toBeInTheDocument();
    expect(
      screen.getByText("settings.oldName -> settings.newName"),
    ).toBeInTheDocument();
    expect(screen.getByText("settings.legacy")).toHaveClass("text-destructive");
  });

  it("accepts the migration by backing up and saving", async () => {
    const user = userEvent.setup();
    render(<MigrationGuideScreen />);

    await user.click(screen.getByRole("button", { name: /accept & upgrade/i }));

    expect(api.backupVault).toHaveBeenCalledWith(
      expect.stringMatching(/^ownkeep-pre-migration-v0\.1-to-v0\.2-/),
    );
    expect(api.saveVault).toHaveBeenCalled();
  });

  it("backs up and quits via the secondary action buttons", async () => {
    const user = userEvent.setup();
    render(<MigrationGuideScreen />);

    await user.click(screen.getByRole("button", { name: /back up & quit/i }));
    expect(api.backupVaultToChosenLocation).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^quit$/i }));
    expect(api.quitApp).toHaveBeenCalled();
  });

  it("requires a second click before erasing the vault", async () => {
    const user = userEvent.setup();
    render(<MigrationGuideScreen />);

    await user.click(
      screen.getByRole("button", { name: /erase & start fresh/i }),
    );
    expect(api.eraseVault).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /erase all data/i }));
    expect(api.eraseVault).toHaveBeenCalled();
  });

  it("renders errors from the store", () => {
    useVaultStore.setState({ error: "boom" });
    render(<MigrationGuideScreen />);
    expect(screen.getByText("boom")).toBeVisible();
  });
});

describe("IncompatibleVaultScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useVaultStore.setState({
      status: "incompatible",
      model: null,
      migration: null,
      postMigrationStatus: "unlocked",
      incompatibleMessage: "You are using an older version of OwnKeep.",
      pendingKit: null,
      busy: false,
      error: null,
    });
  });

  it("shows the old-version message and quits on request", async () => {
    const user = userEvent.setup();
    render(<IncompatibleVaultScreen />);

    expect(screen.getByText(/older version/i)).toBeVisible();
    await user.click(screen.getByRole("button", { name: /quit/i }));

    expect(api.quitApp).toHaveBeenCalled();
  });

  it("uses a generic newer-vault message when no specific message is stored", () => {
    useVaultStore.setState({ incompatibleMessage: null });

    render(<IncompatibleVaultScreen />);

    expect(screen.getByText(/written by a newer version/i)).toBeVisible();
  });
});
