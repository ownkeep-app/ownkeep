import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useVaultStore } from "@/stores/vault-store";
import { vaultApi } from "@/vault/api";
import { LockScreen } from "./LockScreen";
import { OnboardingScreen } from "./OnboardingScreen";

vi.mock("@/vault/api", () => ({
  vaultApi: {
    createVault: vi.fn(async () => ({
      app: "keystash",
      recovery_code: "x",
      instructions: "y",
    })),
    saveVault: vi.fn(async () => {}),
    unlock: vi.fn(async () => {}),
    unlockRecovery: vi.fn(async () => {}),
    getVault: vi.fn(async () => "{}"),
    isUnlocked: vi.fn(async () => false),
    vaultExists: vi.fn(async () => false),
    lock: vi.fn(async () => {}),
    changeMaster: vi.fn(async () => {}),
    regenerateRecovery: vi.fn(async () => ({
      app: "",
      recovery_code: "",
      instructions: "",
    })),
  },
}));

const api = vi.mocked(vaultApi);

beforeEach(() => {
  vi.clearAllMocks();
  useVaultStore.setState({
    status: "onboarding",
    model: null,
    pendingKit: null,
    busy: false,
    error: null,
  });
});

describe("OnboardingScreen", () => {
  it("rejects a mismatch, then creates on a valid match", async () => {
    const user = userEvent.setup();
    render(<OnboardingScreen />);

    await user.type(screen.getByLabelText("Master password"), "supersecret");
    await user.type(screen.getByLabelText("Confirm password"), "different");
    await user.click(screen.getByRole("button", { name: /create vault/i }));
    expect(api.createVault).not.toHaveBeenCalled();
    expect(screen.getByText(/don't match/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Confirm password"));
    await user.type(screen.getByLabelText("Confirm password"), "supersecret");
    await user.click(screen.getByRole("button", { name: /create vault/i }));
    expect(api.createVault).toHaveBeenCalledWith("supersecret");
  });

  it("rejects a too-short password", async () => {
    const user = userEvent.setup();
    render(<OnboardingScreen />);
    await user.type(screen.getByLabelText("Master password"), "short");
    await user.type(screen.getByLabelText("Confirm password"), "short");
    await user.click(screen.getByRole("button", { name: /create vault/i }));
    expect(api.createVault).not.toHaveBeenCalled();
    expect(screen.getByText(/at least 8/i)).toBeInTheDocument();
  });
});

describe("LockScreen", () => {
  it("unlocks with the master password", async () => {
    const user = userEvent.setup();
    render(<LockScreen />);
    await user.type(screen.getByLabelText("Master password"), "pw");
    await user.click(screen.getByRole("button", { name: /unlock/i }));
    expect(api.unlock).toHaveBeenCalledWith("pw");
  });

  it("switches to recovery-code entry", async () => {
    const user = userEvent.setup();
    render(<LockScreen />);
    await user.click(screen.getByRole("button", { name: /recovery code/i }));
    expect(screen.getByLabelText("Recovery code")).toBeInTheDocument();
  });
});
