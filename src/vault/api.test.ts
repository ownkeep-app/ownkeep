import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("vaultApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
  });

  it("maps frontend calls to the audited Tauri command names", async () => {
    const { vaultApi } = await import("./api");

    await vaultApi.vaultExists();
    await vaultApi.isUnlocked();
    await vaultApi.createVault("master");
    await vaultApi.unlock("master");
    await vaultApi.unlockRecovery("words");
    await vaultApi.lock();
    await vaultApi.changeMaster("new master");
    await vaultApi.setAutoLock(15);
    await vaultApi.setHotkeys("Cmd+Shift+Space", "Cmd+Shift+D");
    await vaultApi.regenerateRecovery();
    await vaultApi.getVault();
    await vaultApi.saveVault("{}");
    await vaultApi.copySecret("github", "password");
    await vaultApi.revealSecret("github", "password");
    await vaultApi.vaultIncompatibility();
    await vaultApi.backupVault("keystash.dat");
    await vaultApi.backupVaultToChosenLocation("keystash.dat");
    await vaultApi.restoreVaultFromChosenLocationWithPassword(
      "backup master",
      "pre-restore.dat",
    );
    await vaultApi.restoreVaultFromChosenLocationWithRecovery(
      "backup words",
      "pre-restore.dat",
    );
    await vaultApi.eraseVault();
    await vaultApi.quitApp();

    expect(mockInvoke.mock.calls).toEqual([
      ["vault_exists"],
      ["is_unlocked"],
      ["create_vault", { password: "master" }],
      ["unlock", { password: "master" }],
      ["unlock_recovery", { code: "words" }],
      ["lock"],
      ["change_master", { newPassword: "new master" }],
      ["set_auto_lock", { minutes: 15 }],
      [
        "set_hotkeys",
        { globalHotkey: "Cmd+Shift+Space", dashboardHotkey: "Cmd+Shift+D" },
      ],
      ["regenerate_recovery"],
      ["get_vault"],
      ["save_vault", { json: "{}" }],
      ["copy_secret", { id: "github", field: "password" }],
      ["reveal_secret", { id: "github", field: "password" }],
      ["vault_incompatibility"],
      ["backup_vault", { fileName: "keystash.dat" }],
      ["backup_vault_to_chosen_location", { fileName: "keystash.dat" }],
      [
        "restore_vault_from_chosen_location_with_password",
        { password: "backup master", preRestoreFileName: "pre-restore.dat" },
      ],
      [
        "restore_vault_from_chosen_location_with_recovery",
        { code: "backup words", preRestoreFileName: "pre-restore.dat" },
      ],
      ["erase_vault"],
      ["quit_app"],
    ]);
  });
});
