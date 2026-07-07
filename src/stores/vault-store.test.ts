import { beforeEach, describe, expect, it, vi } from "vitest";

import { vaultApi } from "@/vault/api";
import { APP_VERSION, SCHEMA_VERSION } from "@/vault/model";
import { useVaultStore } from "./vault-store";

vi.mock("@/vault/api", () => ({
  vaultApi: {
    isUnlocked: vi.fn(),
    vaultExists: vi.fn(),
    vaultIncompatibility: vi.fn(async () => null),
    getVault: vi.fn(),
    saveVault: vi.fn(async () => {}),
    backupVault: vi.fn(async () => "/tmp/backup.dat"),
    backupVaultToChosenLocation: vi.fn(async () => "/tmp/chosen-backup.dat"),
    eraseVault: vi.fn(async () => {}),
    quitApp: vi.fn(async () => {}),
    createVault: vi.fn(async () => ({
      app: "keystash",
      recovery_code: "a b c",
      instructions: "store it",
    })),
    unlock: vi.fn(async () => {}),
    unlockRecovery: vi.fn(async () => {}),
    changeMaster: vi.fn(async () => {}),
    lock: vi.fn(async () => {}),
    setAutoLock: vi.fn(async () => {}),
    regenerateRecovery: vi.fn(async () => ({
      app: "",
      recovery_code: "",
      instructions: "",
    })),
  },
}));

const api = vi.mocked(vaultApi);

describe("vault store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("init → onboarding when no vault exists", async () => {
    api.isUnlocked.mockResolvedValue(false);
    api.vaultExists.mockResolvedValue(false);
    await useVaultStore.getState().init();
    expect(useVaultStore.getState().status).toBe("onboarding");
  });

  it("init → locked when a vault exists but is locked", async () => {
    api.isUnlocked.mockResolvedValue(false);
    api.vaultExists.mockResolvedValue(true);
    await useVaultStore.getState().init();
    expect(useVaultStore.getState().status).toBe("locked");
  });

  it("init → incompatible when the container is newer than this build (pre-unlock)", async () => {
    api.isUnlocked.mockResolvedValue(false);
    api.vaultExists.mockResolvedValue(true);
    api.vaultIncompatibility.mockResolvedValue(
      "This vault was written by a newer keystash. Please upgrade keystash.",
    );
    await useVaultStore.getState().init();
    const state = useVaultStore.getState();
    expect(state.status).toBe("incompatible");
    expect(state.incompatibleMessage).toMatch(/newer keystash/i);
  });

  it("init → unlocked hydrates the model from the registry", async () => {
    api.isUnlocked.mockResolvedValue(true);
    api.getVault.mockResolvedValue("{}");
    await useVaultStore.getState().init();
    const state = useVaultStore.getState();
    expect(state.status).toBe("unlocked");
    expect(state.model?.settings.modules.passwords.enabled).toBe(true);
  });

  it("init refuses an already-unlocked vault written by a newer app", async () => {
    api.isUnlocked.mockResolvedValue(true);
    api.getVault.mockResolvedValue(
      JSON.stringify({
        meta: {
          schemaVersion: SCHEMA_VERSION,
          appVersion: "99.0",
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      }),
    );

    await useVaultStore.getState().init();

    expect(useVaultStore.getState().status).toBe("incompatible");
    expect(api.lock).toHaveBeenCalled();
  });

  it("init stores unexpected errors without changing lifecycle state", async () => {
    api.isUnlocked.mockRejectedValueOnce(new Error("ipc down"));

    await useVaultStore.getState().init();

    expect(useVaultStore.getState().status).toBe("loading");
    expect(useVaultStore.getState().error).toMatch(/ipc down/);
  });

  it("unlock stops at the migration guide when an older schema needs migration", async () => {
    api.getVault.mockResolvedValue(
      JSON.stringify({
        meta: {
          schemaVersion: 1,
          appVersion: "0.0",
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
        settings: { modules: { passwords: { enabled: false } } },
        modules: { passwords: [{ id: "keep" }] },
      }),
    );

    await useVaultStore.getState().unlock("master pw");

    const state = useVaultStore.getState();
    expect(state.status).toBe("migration");
    expect(state.migration?.fromSchemaVersion).toBe(1);
    expect(state.migration?.toSchemaVersion).toBe(SCHEMA_VERSION);
    expect(api.saveVault).not.toHaveBeenCalled();
  });

  it("acceptMigration backs up, migrates, stamps, and unlocks", async () => {
    api.getVault.mockResolvedValue(
      JSON.stringify({
        meta: {
          schemaVersion: 1,
          appVersion: "0.0",
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      }),
    );
    await useVaultStore.getState().unlock("master pw");

    await useVaultStore.getState().acceptMigration();

    expect(api.backupVault).toHaveBeenCalledWith(
      expect.stringMatching(/^keystash-pre-migration-v0\.0-to-v/),
    );
    expect(api.saveVault).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(saved.meta.appVersion).toBe(APP_VERSION);
    expect(useVaultStore.getState().status).toBe("unlocked");
    expect(useVaultStore.getState().migration).toBeNull();
  });

  it("acceptMigration leaves the vault in the migration gate when the write fails", async () => {
    api.getVault.mockResolvedValue(
      JSON.stringify({
        meta: {
          schemaVersion: 1,
          appVersion: "0.0",
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      }),
    );
    await useVaultStore.getState().unlock("master pw");
    api.saveVault.mockRejectedValueOnce(new Error("disk full"));

    await expect(useVaultStore.getState().acceptMigration()).rejects.toThrow(
      /disk full/,
    );

    // A failed write leaves the original (un-migrated) vault untouched and still gated.
    const state = useVaultStore.getState();
    expect(state.status).toBe("migration");
    expect(state.migration?.fromSchemaVersion).toBe(1);
    expect(state.error).toMatch(/disk full/);
  });

  it("backupMigrationAndQuit backs up the unmigrated vault to a chosen location and quits", async () => {
    api.getVault.mockResolvedValue(
      JSON.stringify({
        meta: {
          schemaVersion: 1,
          appVersion: "0.0",
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      }),
    );
    await useVaultStore.getState().unlock("master pw");

    await useVaultStore.getState().backupMigrationAndQuit();

    expect(api.backupVaultToChosenLocation).toHaveBeenCalledWith(
      expect.stringMatching(/^keystash-v0\.0-/),
    );
    expect(api.quitApp).toHaveBeenCalled();
  });

  it("backupMigrationAndQuit does not quit when the backup dialog is cancelled", async () => {
    api.backupVaultToChosenLocation.mockResolvedValueOnce(null);
    api.getVault.mockResolvedValue(
      JSON.stringify({
        meta: {
          schemaVersion: 1,
          appVersion: "0.0",
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      }),
    );
    await useVaultStore.getState().unlock("master pw");

    await useVaultStore.getState().backupMigrationAndQuit();

    expect(api.quitApp).not.toHaveBeenCalled();
    expect(useVaultStore.getState().status).toBe("migration");
  });

  it("eraseVaultAndStartFresh deletes the vault and returns to onboarding", async () => {
    useVaultStore.setState({ status: "migration" });

    await useVaultStore.getState().eraseVaultAndStartFresh();

    expect(api.eraseVault).toHaveBeenCalled();
    expect(useVaultStore.getState().status).toBe("onboarding");
    expect(useVaultStore.getState().model).toBeNull();
  });

  it("refuses a vault written by a newer app", async () => {
    api.getVault.mockResolvedValue(
      JSON.stringify({
        meta: {
          schemaVersion: SCHEMA_VERSION,
          appVersion: "99.0",
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      }),
    );

    await useVaultStore.getState().unlock("master pw");

    expect(useVaultStore.getState().status).toBe("incompatible");
    expect(useVaultStore.getState().incompatibleMessage).toMatch(
      /older version/i,
    );
    expect(api.lock).toHaveBeenCalled();
  });

  it("surfaces unlock errors from the Rust core", async () => {
    api.unlock.mockRejectedValueOnce(new Error("wrong password"));

    await expect(useVaultStore.getState().unlock("bad")).rejects.toThrow(
      /wrong password/,
    );

    expect(useVaultStore.getState().error).toMatch(/wrong password/);
    expect(useVaultStore.getState().busy).toBe(false);
  });

  it("create persists a default model and unlocks", async () => {
    const kit = await useVaultStore.getState().create("master pw");
    expect(kit.recovery_code).toBe("a b c");
    expect(api.saveVault).toHaveBeenCalledTimes(1);
    expect(useVaultStore.getState().status).toBe("unlocked");
    expect(useVaultStore.getState().pendingKit?.recovery_code).toBe("a b c");
  });

  it("recovery unlock enters reset mode, then changeMaster completes it", async () => {
    api.getVault.mockResolvedValue("{}");
    await useVaultStore.getState().unlockRecovery("word ".repeat(12).trim());
    expect(useVaultStore.getState().status).toBe("reset");
    await useVaultStore.getState().changeMaster("brand new master");
    expect(useVaultStore.getState().status).toBe("unlocked");
  });

  it("recovery unlock stops at the migration guide before forcing the master reset", async () => {
    api.getVault.mockResolvedValue(
      JSON.stringify({
        meta: {
          schemaVersion: 1,
          appVersion: "0.0",
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      }),
    );

    await useVaultStore.getState().unlockRecovery("word ".repeat(12).trim());

    const state = useVaultStore.getState();
    expect(state.status).toBe("migration");
    expect(state.postMigrationStatus).toBe("reset");
  });

  it("recovery unlock refuses a vault written by a newer app", async () => {
    api.getVault.mockResolvedValue(
      JSON.stringify({
        meta: {
          schemaVersion: SCHEMA_VERSION,
          appVersion: "99.0",
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      }),
    );

    await useVaultStore.getState().unlockRecovery("word ".repeat(12).trim());

    expect(useVaultStore.getState().status).toBe("incompatible");
    expect(api.lock).toHaveBeenCalled();
  });

  it("lock clears sensitive UI state and returns to locked", async () => {
    useVaultStore.setState({
      status: "unlocked",
      model: null,
      pendingKit: {
        app: "keystash",
        recovery_code: "a b c",
        instructions: "save it",
      },
      migration: {} as never,
      incompatibleMessage: "old",
      error: "previous",
    });

    await useVaultStore.getState().lock();

    const state = useVaultStore.getState();
    expect(api.lock).toHaveBeenCalled();
    expect(state.status).toBe("locked");
    expect(state.pendingKit).toBeNull();
    expect(state.migration).toBeNull();
    expect(state.error).toBeNull();
  });

  it("toggleModule persists the flipped flag", async () => {
    api.isUnlocked.mockResolvedValue(true);
    api.getVault.mockResolvedValue("{}");
    await useVaultStore.getState().init();

    await useVaultStore.getState().toggleModule("finance", false);

    expect(api.saveVault).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.settings.modules.finance.enabled).toBe(false);
    expect(
      useVaultStore.getState().model?.settings.modules.finance.enabled,
    ).toBe(false);
  });

  it("setAutoLock persists the minutes and pushes them to the Rust session", async () => {
    api.isUnlocked.mockResolvedValue(true);
    api.getVault.mockResolvedValue("{}");
    await useVaultStore.getState().init();

    await useVaultStore.getState().setAutoLock(0); // "Never"

    const saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.settings.autoLockMinutes).toBe(0);
    expect(api.setAutoLock).toHaveBeenCalledWith(0);
    expect(useVaultStore.getState().model?.settings.autoLockMinutes).toBe(0);
  });

  it("unlock pushes the vault's stored auto-lock setting to the Rust session", async () => {
    api.getVault.mockResolvedValue(
      JSON.stringify({
        meta: {
          schemaVersion: SCHEMA_VERSION,
          appVersion: APP_VERSION,
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
        settings: { autoLockMinutes: 15 },
      }),
    );

    await useVaultStore.getState().unlock("master pw");

    expect(api.setAutoLock).toHaveBeenCalledWith(15);
    expect(useVaultStore.getState().status).toBe("unlocked");
  });

  it("no-ops migration and model actions when their required state is absent", async () => {
    await useVaultStore.getState().acceptMigration();
    await useVaultStore.getState().backupMigrationAndQuit();
    await useVaultStore.getState().setAutoLock(5);
    await useVaultStore.getState().toggleModule("passwords", false);

    expect(api.backupVault).not.toHaveBeenCalled();
    expect(api.backupVaultToChosenLocation).not.toHaveBeenCalled();
    expect(api.saveVault).not.toHaveBeenCalled();
  });

  it("keeps the migration gate when backing up before quit fails", async () => {
    api.backupVaultToChosenLocation.mockRejectedValueOnce(
      new Error("permission denied"),
    );
    api.getVault.mockResolvedValue(
      JSON.stringify({
        meta: {
          schemaVersion: 1,
          appVersion: "0.0",
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      }),
    );
    await useVaultStore.getState().unlock("master pw");

    await expect(
      useVaultStore.getState().backupMigrationAndQuit(),
    ).rejects.toThrow(/permission denied/);

    expect(api.quitApp).not.toHaveBeenCalled();
    expect(useVaultStore.getState().status).toBe("migration");
    expect(useVaultStore.getState().error).toMatch(/permission denied/);
  });

  it("surfaces erase failures without leaving the migration state", async () => {
    api.eraseVault.mockRejectedValueOnce(new Error("cannot remove"));
    useVaultStore.setState({ status: "migration" });

    await expect(
      useVaultStore.getState().eraseVaultAndStartFresh(),
    ).rejects.toThrow(/cannot remove/);

    expect(useVaultStore.getState().status).toBe("migration");
    expect(useVaultStore.getState().error).toMatch(/cannot remove/);
  });
});
