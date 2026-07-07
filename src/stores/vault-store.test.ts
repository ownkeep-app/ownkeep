import { beforeEach, describe, expect, it, vi } from "vitest";

import { vaultApi } from "@/vault/api";
import { useVaultStore } from "./vault-store";

vi.mock("@/vault/api", () => ({
  vaultApi: {
    isUnlocked: vi.fn(),
    vaultExists: vi.fn(),
    getVault: vi.fn(),
    saveVault: vi.fn(async () => {}),
    createVault: vi.fn(async () => ({
      app: "keystash",
      recovery_code: "a b c",
      instructions: "store it",
    })),
    unlock: vi.fn(async () => {}),
    unlockRecovery: vi.fn(async () => {}),
    changeMaster: vi.fn(async () => {}),
    lock: vi.fn(async () => {}),
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

  it("init → unlocked hydrates the model from the registry", async () => {
    api.isUnlocked.mockResolvedValue(true);
    api.getVault.mockResolvedValue("{}");
    await useVaultStore.getState().init();
    const state = useVaultStore.getState();
    expect(state.status).toBe("unlocked");
    expect(state.model?.settings.modules.passwords.enabled).toBe(true);
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
});
