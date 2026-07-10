import { beforeEach, describe, expect, it, vi } from "vitest";

import { vaultApi } from "@/vault/api";
import { APP_VERSION, createDefaultModel, SCHEMA_VERSION } from "@/vault/model";
import { useVaultStore } from "./vault-store";
import type { SubscriptionEntry } from "@/modules/subscriptions/types";
import type { TodoEntry } from "@/modules/todos/types";

vi.mock("@/vault/api", () => ({
  vaultApi: {
    isUnlocked: vi.fn(),
    vaultExists: vi.fn(),
    vaultIncompatibility: vi.fn(async () => null),
    getVault: vi.fn(),
    saveVault: vi.fn(async () => {}),
    copySecret: vi.fn(async () => {}),
    revealSecret: vi.fn(async () => {}),
    backupVault: vi.fn(async () => "/tmp/backup.dat"),
    backupVaultToChosenLocation: vi.fn(async () => "/tmp/chosen-backup.dat"),
    restoreVaultFromChosenLocationWithPassword: vi.fn(
      async () => "/tmp/restored.dat",
    ),
    restoreVaultFromChosenLocationWithRecovery: vi.fn(
      async () => "/tmp/restored.dat",
    ),
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
    setHotkeys: vi.fn(async () => {}),
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

  it("backupVault writes the encrypted container to a chosen versioned filename", async () => {
    useVaultStore.setState({
      model: createDefaultModel("2026-07-07T00:00:00.000Z"),
    });

    const backupPath = await useVaultStore.getState().backupVault();

    expect(backupPath).toBe("/tmp/chosen-backup.dat");
    expect(api.backupVaultToChosenLocation).toHaveBeenCalledWith(
      expect.stringMatching(/^keystash-v0\.1-/),
    );
    expect(useVaultStore.getState().busy).toBe(false);
  });

  it("backupVault surfaces file-picker or copy failures", async () => {
    api.backupVaultToChosenLocation.mockRejectedValueOnce(
      new Error("no permission"),
    );
    useVaultStore.setState({
      model: createDefaultModel("2026-07-07T00:00:00.000Z"),
    });

    await expect(useVaultStore.getState().backupVault()).rejects.toThrow(
      /no permission/,
    );

    expect(useVaultStore.getState().error).toMatch(/no permission/);
  });

  it("restoreVaultWithPassword verifies the selected backup then reloads the restored model", async () => {
    api.getVault.mockResolvedValue(
      JSON.stringify({
        settings: { autoLockMinutes: 15, theme: "dark" },
      }),
    );

    const restoredPath = await useVaultStore
      .getState()
      .restoreVaultWithPassword("backup pw");

    expect(restoredPath).toBe("/tmp/restored.dat");
    expect(api.restoreVaultFromChosenLocationWithPassword).toHaveBeenCalledWith(
      "backup pw",
      expect.stringMatching(/^keystash-pre-restore-/),
    );
    expect(api.setAutoLock).toHaveBeenCalledWith(15);
    expect(useVaultStore.getState().status).toBe("unlocked");
    expect(useVaultStore.getState().model?.settings.theme).toBe("dark");
  });

  it("restoreVaultWithPassword moves to incompatible when the restored model is newer", async () => {
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

    const restoredPath = await useVaultStore
      .getState()
      .restoreVaultWithPassword("backup pw");

    expect(restoredPath).toBeNull();
    expect(api.lock).toHaveBeenCalled();
    expect(useVaultStore.getState().status).toBe("incompatible");
    expect(useVaultStore.getState().incompatibleMessage).toMatch(
      /older version/i,
    );
  });

  it("restoreVaultWithRecovery does not reload when the picker is cancelled", async () => {
    api.restoreVaultFromChosenLocationWithRecovery.mockResolvedValueOnce(null);

    const restoredPath = await useVaultStore
      .getState()
      .restoreVaultWithRecovery("backup words");

    expect(restoredPath).toBeNull();
    expect(api.getVault).not.toHaveBeenCalled();
    expect(useVaultStore.getState().busy).toBe(false);
  });

  it("restoreVaultWithRecovery reloads a restored backup", async () => {
    api.getVault.mockResolvedValue(
      JSON.stringify({
        settings: { theme: "light", resultLimit: 5 },
      }),
    );

    const restoredPath = await useVaultStore
      .getState()
      .restoreVaultWithRecovery("backup words");

    expect(restoredPath).toBe("/tmp/restored.dat");
    expect(api.restoreVaultFromChosenLocationWithRecovery).toHaveBeenCalledWith(
      "backup words",
      expect.stringMatching(/^keystash-pre-restore-/),
    );
    expect(useVaultStore.getState().model?.settings.resultLimit).toBe(5);
  });

  it("restore surfaces wrong-password failures without loading a replacement model", async () => {
    api.restoreVaultFromChosenLocationWithPassword.mockRejectedValueOnce(
      new Error("authentication failed"),
    );

    await expect(
      useVaultStore.getState().restoreVaultWithPassword("wrong"),
    ).rejects.toThrow(/authentication failed/);

    expect(api.getVault).not.toHaveBeenCalled();
    expect(useVaultStore.getState().error).toMatch(/authentication failed/);
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

  it("toggleModuleSearchable persists the flipped flag", async () => {
    api.isUnlocked.mockResolvedValue(true);
    api.getVault.mockResolvedValue("{}");
    await useVaultStore.getState().init();

    expect(
      useVaultStore.getState().model?.settings.modules.passwords.searchable,
    ).toBe(true);

    await useVaultStore.getState().toggleModuleSearchable("passwords", false);

    const saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.settings.modules.passwords.searchable).toBe(false);
    expect(
      useVaultStore.getState().model?.settings.modules.passwords.searchable,
    ).toBe(false);
  });

  it("saveSnapshot adds then updates a finance snapshot", async () => {
    api.isUnlocked.mockResolvedValue(true);
    api.getVault.mockResolvedValue("{}");
    await useVaultStore.getState().init();

    await useVaultStore.getState().saveSnapshot({
      id: "s1",
      date: "2026-07-01T00:00:00.000Z",
      entries: [
        { place: "DBS", category: "bank", amount: 100, currency: "USD" },
      ],
      note: "old",
      updatedAt: "2026-07-07T00:00:00.000Z",
    });
    let saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.modules.finance).toHaveLength(1);
    expect(saved.modules.finance[0].id).toBe("s1");

    api.getVault.mockResolvedValue(
      JSON.stringify({
        modules: {
          finance: [
            {
              id: "s1",
              date: "2026-07-01T00:00:00.000Z",
              entries: [],
              note: "old",
              updatedAt: "2026-07-07T00:00:00.000Z",
            },
          ],
        },
      }),
    );
    await useVaultStore.getState().saveSnapshot({
      id: "s1",
      date: "2026-07-01T00:00:00.000Z",
      entries: [],
      note: "new",
      updatedAt: "2026-07-08T00:00:00.000Z",
    });
    saved = JSON.parse(api.saveVault.mock.calls[1][0] as string);
    expect(saved.modules.finance).toHaveLength(1);
    expect(saved.modules.finance[0].note).toBe("new");
  });

  it("deleteSnapshot removes a finance snapshot", async () => {
    api.isUnlocked.mockResolvedValue(true);
    api.getVault.mockResolvedValue(
      JSON.stringify({
        modules: {
          finance: [
            {
              id: "s1",
              date: "2026-07-01T00:00:00.000Z",
              entries: [],
              note: "",
              updatedAt: "2026-07-01T00:00:00.000Z",
            },
          ],
        },
      }),
    );
    await useVaultStore.getState().init();

    await useVaultStore.getState().deleteSnapshot("s1");
    const saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.modules.finance).toEqual([]);
  });

  it("updateFinanceSettings persists base currency and FX rates", async () => {
    api.isUnlocked.mockResolvedValue(true);
    api.getVault.mockResolvedValue("{}");
    await useVaultStore.getState().init();

    await useVaultStore
      .getState()
      .updateFinanceSettings({ baseCurrency: "SGD", fxRates: { USD: 1.35 } });
    const saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.settings.modules.finance.baseCurrency).toBe("SGD");
    expect(saved.settings.modules.finance.fxRates).toEqual({ USD: 1.35 });
  });

  it("finance mutations no-op without a model and coerce a non-array slice", async () => {
    useVaultStore.setState({ model: null });
    await useVaultStore.getState().saveSnapshot({
      id: "x",
      date: "2026-07-01T00:00:00.000Z",
      entries: [],
      note: "",
      updatedAt: "2026-07-07T00:00:00.000Z",
    });
    await useVaultStore.getState().deleteSnapshot("x");
    await useVaultStore
      .getState()
      .updateFinanceSettings({ baseCurrency: "USD" });
    expect(api.saveVault).not.toHaveBeenCalled();

    api.isUnlocked.mockResolvedValue(true);
    api.getVault.mockResolvedValue(
      JSON.stringify({ modules: { finance: { legacy: true } } }),
    );
    await useVaultStore.getState().init();

    await useVaultStore.getState().saveSnapshot({
      id: "s1",
      date: "2026-07-01T00:00:00.000Z",
      entries: [],
      note: "",
      updatedAt: "2026-07-07T00:00:00.000Z",
    });
    const added = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(added.modules.finance).toHaveLength(1);

    await useVaultStore.getState().deleteSnapshot("s1");
    const removed = JSON.parse(api.saveVault.mock.calls[1][0] as string);
    expect(removed.modules.finance).toEqual([]);
  });

  it("savePassword persists plaintext once and reloads the redacted projection", async () => {
    api.isUnlocked.mockResolvedValue(true);
    api.getVault.mockResolvedValueOnce("{}").mockResolvedValueOnce(
      JSON.stringify({
        meta: {
          schemaVersion: SCHEMA_VERSION,
          appVersion: APP_VERSION,
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
        modules: {
          passwords: [
            {
              id: "github",
              name: "GitHub",
              username: "sha",
              password: "__KEYSTASH_REDACTED_SECRET__",
              loginUrl: "",
              recoveryUrl: "",
              notes: "",
              category: "Personal",
              updatedAt: "2026-07-07T00:00:00.000Z",
            },
          ],
        },
      }),
    );
    await useVaultStore.getState().init();

    await useVaultStore.getState().savePassword({
      id: "github",
      name: "GitHub",
      username: "sha",
      password: "secret",
      loginUrl: "",
      recoveryUrl: "",
      notes: "",
      category: "Personal",
      updatedAt: "2026-07-07T00:00:00.000Z",
    });

    const saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.modules.passwords[0].password).toBe("secret");
    const projected = useVaultStore.getState().model?.modules
      .passwords as Array<{ password: string }>;
    expect(projected[0].password).toBe("__KEYSTASH_REDACTED_SECRET__");
  });

  it("savePassword creates a new entry when the slice is missing or not an array", async () => {
    api.isUnlocked.mockResolvedValue(true);
    api.getVault
      .mockResolvedValueOnce(
        JSON.stringify({
          meta: {
            schemaVersion: SCHEMA_VERSION,
            appVersion: APP_VERSION,
            createdAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z",
          },
          modules: { passwords: { not: "an array" } },
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          meta: {
            schemaVersion: SCHEMA_VERSION,
            appVersion: APP_VERSION,
            createdAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z",
          },
          modules: {
            passwords: [
              {
                id: "new",
                name: "New",
                username: "",
                password: "__KEYSTASH_REDACTED_SECRET__",
                loginUrl: "",
                recoveryUrl: "",
                notes: "",
                category: "Personal",
                updatedAt: "2026-07-07T00:00:00.000Z",
              },
            ],
          },
        }),
      );

    await useVaultStore.getState().init();
    await useVaultStore.getState().savePassword({
      id: "new",
      name: "New",
      username: "",
      password: "secret",
      loginUrl: "",
      recoveryUrl: "",
      notes: "",
      category: "Personal",
      updatedAt: "2026-07-07T00:00:00.000Z",
    });

    const calls = api.saveVault.mock.calls;
    const saved = JSON.parse(calls[calls.length - 1][0] as string);
    expect(saved.modules.passwords).toHaveLength(1);
    expect(saved.modules.passwords[0].id).toBe("new");
  });

  it("deletePassword removes the item and reloads the projection", async () => {
    api.isUnlocked.mockResolvedValue(true);
    api.getVault.mockResolvedValueOnce(
      JSON.stringify({
        modules: {
          passwords: [
            {
              id: "github",
              name: "GitHub",
              username: "sha",
              password: "__KEYSTASH_REDACTED_SECRET__",
              loginUrl: "",
              recoveryUrl: "",
              notes: "",
              category: "Personal",
              updatedAt: "2026-07-07T00:00:00.000Z",
            },
          ],
        },
      }),
    );
    api.getVault.mockResolvedValueOnce(
      JSON.stringify({ modules: { passwords: [] } }),
    );
    await useVaultStore.getState().init();

    await useVaultStore.getState().deletePassword("github");

    const saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.modules.passwords).toEqual([]);
    expect(useVaultStore.getState().model?.modules.passwords).toEqual([]);
  });

  it("copySecret delegates to the Rust copy command", async () => {
    await useVaultStore.getState().copySecret("github", "password");

    expect(api.copySecret).toHaveBeenCalledWith("github", "password");
  });

  it("revealSecret delegates to the Rust reveal command", async () => {
    await useVaultStore.getState().revealSecret("github", "password");

    expect(api.revealSecret).toHaveBeenCalledWith("github", "password");
  });

  it("recordUse bumps the item's frecency and persists it", async () => {
    api.isUnlocked.mockResolvedValue(true);
    api.getVault.mockResolvedValue("{}");
    await useVaultStore.getState().init();

    await useVaultStore.getState().recordUse("gh");

    const saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.frecency.gh.count).toBe(1);
    expect(useVaultStore.getState().model?.frecency.gh.count).toBe(1);
  });

  it("recordUse is a no-op without a loaded model", async () => {
    await useVaultStore.getState().recordUse("gh");
    expect(api.saveVault).not.toHaveBeenCalled();
  });

  const commandFixture = {
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

  const todoFixture: TodoEntry = {
    id: "todo-1",
    title: "Renew passport",
    notes: "",
    done: false,
    dueAt: "2026-07-08T12:30:00.000Z",
    notifyLeadMinutes: 30,
    priority: "normal",
    category: "Personal",
    recurrence: "none",
    updatedAt: "2026-07-07T00:00:00.000Z",
  };

  const subscriptionFixture: SubscriptionEntry = {
    id: "sub-1",
    service: "Linode",
    url: "https://cloud.linode.com/account/billing",
    amount: 20,
    currency: "USD",
    cycle: "monthly",
    customIntervalDays: null,
    nextDueDate: "2026-07-10T00:00:00.000Z",
    autoRenew: true,
    notifyLeadDays: 3,
    notes: "",
    category: "Personal",
    tags: [],
    updatedAt: "2026-07-07T00:00:00.000Z",
  };

  it("saveCommand adds a command and persists it", async () => {
    api.getVault.mockResolvedValue("{}");
    useVaultStore.setState({
      model: createDefaultModel("2026-07-07T00:00:00.000Z"),
    });

    await useVaultStore.getState().saveCommand(commandFixture);

    const saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.modules.commands[0].id).toBe("c1");
  });

  it("saveCommand updates an existing command in place", async () => {
    api.getVault.mockResolvedValue("{}");
    useVaultStore.setState({
      model: {
        ...createDefaultModel("2026-07-07T00:00:00.000Z"),
        modules: { commands: [commandFixture] },
      },
    });

    await useVaultStore
      .getState()
      .saveCommand({ ...commandFixture, title: "Renamed" });

    const saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.modules.commands).toHaveLength(1);
    expect(saved.modules.commands[0].title).toBe("Renamed");
  });

  it("deleteCommand removes a command", async () => {
    api.getVault.mockResolvedValue("{}");
    useVaultStore.setState({
      model: {
        ...createDefaultModel("2026-07-07T00:00:00.000Z"),
        modules: { commands: [commandFixture] },
      },
    });

    await useVaultStore.getState().deleteCommand("c1");

    const saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.modules.commands).toEqual([]);
  });

  it("saveCommand and deleteCommand are no-ops without a model", async () => {
    useVaultStore.setState({ model: null });
    await useVaultStore.getState().saveCommand(commandFixture);
    await useVaultStore.getState().deleteCommand("c1");
    expect(api.saveVault).not.toHaveBeenCalled();
  });

  it("saveTodo adds and updates todos", async () => {
    api.getVault.mockResolvedValue("{}");
    useVaultStore.setState({
      model: createDefaultModel("2026-07-07T00:00:00.000Z"),
    });

    await useVaultStore.getState().saveTodo(todoFixture);
    let saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.modules.todos[0].title).toBe("Renew passport");

    useVaultStore.setState({
      model: {
        ...createDefaultModel("2026-07-07T00:00:00.000Z"),
        modules: { todos: [todoFixture] },
      },
    });
    await useVaultStore
      .getState()
      .saveTodo({ ...todoFixture, title: "Renew passport soon" });
    saved = JSON.parse(api.saveVault.mock.calls[1][0] as string);
    expect(saved.modules.todos).toHaveLength(1);
    expect(saved.modules.todos[0].title).toBe("Renew passport soon");
  });

  it("deleteTodo removes a todo and toggleTodoDone handles recurrence", async () => {
    api.getVault.mockResolvedValue("{}");
    useVaultStore.setState({
      model: {
        ...createDefaultModel("2026-07-07T00:00:00.000Z"),
        modules: {
          todos: [
            {
              ...todoFixture,
              dueAt: "2026-07-01T13:00:00.000Z",
              recurrence: "weekly",
            },
          ],
        },
      },
    });

    await useVaultStore.getState().toggleTodoDone("todo-1");
    let saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.modules.todos[0].done).toBe(false);
    expect(Date.parse(saved.modules.todos[0].dueAt)).toBeGreaterThan(
      Date.parse("2026-07-01T13:00:00.000Z"),
    );

    useVaultStore.setState({
      model: {
        ...createDefaultModel("2026-07-07T00:00:00.000Z"),
        modules: { todos: [todoFixture] },
      },
    });
    await useVaultStore.getState().deleteTodo("todo-1");
    saved = JSON.parse(api.saveVault.mock.calls[1][0] as string);
    expect(saved.modules.todos).toEqual([]);
  });

  it("toggleTodoDone updates the in-memory model without reloading getVault", async () => {
    api.getVault.mockResolvedValue("{}");
    useVaultStore.setState({
      model: {
        ...createDefaultModel("2026-07-07T00:00:00.000Z"),
        modules: { todos: [todoFixture] },
      },
    });

    await useVaultStore.getState().toggleTodoDone("todo-1");

    expect(api.getVault).not.toHaveBeenCalled();
    expect(useVaultStore.getState().model?.modules.todos).toEqual([
      expect.objectContaining({ id: "todo-1", done: true }),
    ]);
  });

  it("todo actions are no-ops without a model", async () => {
    useVaultStore.setState({ model: null });
    await useVaultStore.getState().saveTodo(todoFixture);
    await useVaultStore.getState().deleteTodo("todo-1");
    await useVaultStore.getState().toggleTodoDone("todo-1");
    expect(api.saveVault).not.toHaveBeenCalled();
  });

  it("saveSubscription adds and updates subscriptions", async () => {
    api.getVault.mockResolvedValue("{}");
    useVaultStore.setState({
      model: createDefaultModel("2026-07-07T00:00:00.000Z"),
    });

    await useVaultStore.getState().saveSubscription(subscriptionFixture);
    let saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.modules.subscriptions[0].service).toBe("Linode");

    useVaultStore.setState({
      model: {
        ...createDefaultModel("2026-07-07T00:00:00.000Z"),
        modules: { subscriptions: [subscriptionFixture] },
      },
    });
    await useVaultStore
      .getState()
      .saveSubscription({ ...subscriptionFixture, service: "Linode Pro" });
    saved = JSON.parse(api.saveVault.mock.calls[1][0] as string);
    expect(saved.modules.subscriptions).toHaveLength(1);
    expect(saved.modules.subscriptions[0].service).toBe("Linode Pro");
  });

  it("deleteSubscription removes a subscription", async () => {
    api.getVault.mockResolvedValue("{}");
    useVaultStore.setState({
      model: {
        ...createDefaultModel("2026-07-07T00:00:00.000Z"),
        modules: { subscriptions: [subscriptionFixture] },
      },
    });

    await useVaultStore.getState().deleteSubscription("sub-1");

    const saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.modules.subscriptions).toEqual([]);
  });

  it("subscription actions tolerate non-array slices", async () => {
    api.getVault.mockResolvedValue("{}");
    useVaultStore.setState({
      model: {
        ...createDefaultModel("2026-07-07T00:00:00.000Z"),
        modules: { subscriptions: { not: "an array" } },
      },
    });

    await useVaultStore.getState().saveSubscription(subscriptionFixture);
    let saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.modules.subscriptions).toEqual([subscriptionFixture]);

    useVaultStore.setState({
      model: {
        ...createDefaultModel("2026-07-07T00:00:00.000Z"),
        modules: { subscriptions: { still: "not an array" } },
      },
    });
    await useVaultStore.getState().deleteSubscription("sub-1");
    saved = JSON.parse(api.saveVault.mock.calls[1][0] as string);
    expect(saved.modules.subscriptions).toEqual([]);
  });

  it("subscription actions are no-ops without a model", async () => {
    useVaultStore.setState({ model: null });
    await useVaultStore.getState().saveSubscription(subscriptionFixture);
    await useVaultStore.getState().deleteSubscription("sub-1");
    expect(api.saveVault).not.toHaveBeenCalled();
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

  it("updateSettings persists encrypted settings fields", async () => {
    api.isUnlocked.mockResolvedValue(true);
    api.getVault.mockResolvedValue("{}");
    await useVaultStore.getState().init();

    await useVaultStore.getState().updateSettings({
      globalHotkey: "Cmd+Option+Space",
      clipboardClearSeconds: 12,
      theme: "dark",
      accent: "#00AA88",
      resultLimit: 5,
    });

    const saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.settings.globalHotkey).toBe("Cmd+Option+Space");
    expect(saved.settings.clipboardClearSeconds).toBe(12);
    expect(saved.settings.theme).toBe("dark");
    expect(saved.settings.accent).toBe("#00AA88");
    expect(saved.settings.resultLimit).toBe(5);
    expect(api.setHotkeys).toHaveBeenCalledWith(
      "Cmd+Option+Space",
      "Cmd+Shift+D",
    );
  });

  it("regenerateRecovery stores the one-time kit for Settings to display", async () => {
    api.regenerateRecovery.mockResolvedValueOnce({
      app: "keystash",
      recovery_code: "fresh words",
      instructions: "Save it.",
    });

    const kit = await useVaultStore.getState().regenerateRecovery();

    expect(kit.recovery_code).toBe("fresh words");
    expect(useVaultStore.getState().pendingKit?.recovery_code).toBe(
      "fresh words",
    );
  });

  it("regenerateRecovery surfaces backend failures", async () => {
    api.regenerateRecovery.mockRejectedValueOnce(new Error("rewrap failed"));

    await expect(useVaultStore.getState().regenerateRecovery()).rejects.toThrow(
      /rewrap failed/,
    );

    expect(useVaultStore.getState().error).toMatch(/rewrap failed/);
    expect(useVaultStore.getState().busy).toBe(false);
  });

  it("unlock pushes stored runtime settings to the Rust session", async () => {
    api.getVault.mockResolvedValue(
      JSON.stringify({
        meta: {
          schemaVersion: SCHEMA_VERSION,
          appVersion: APP_VERSION,
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
        settings: {
          autoLockMinutes: 15,
          globalHotkey: "Cmd+Option+Space",
          dashboardHotkey: "Cmd+Option+D",
        },
      }),
    );

    await useVaultStore.getState().unlock("master pw");

    expect(api.setAutoLock).toHaveBeenCalledWith(15);
    expect(api.setHotkeys).toHaveBeenCalledWith(
      "Cmd+Option+Space",
      "Cmd+Option+D",
    );
    expect(useVaultStore.getState().status).toBe("unlocked");
  });

  it("no-ops migration and model actions when their required state is absent", async () => {
    await useVaultStore.getState().acceptMigration();
    await useVaultStore.getState().backupVault();
    await useVaultStore.getState().backupMigrationAndQuit();
    await useVaultStore.getState().updateSettings({ theme: "dark" });
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
