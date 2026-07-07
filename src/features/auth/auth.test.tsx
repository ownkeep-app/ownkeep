import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { whenMainWindowReady } from "@/lib/window";
import { useVaultStore } from "@/stores/vault-store";
import { vaultApi } from "@/vault/api";
import { EmergencyKitScreen } from "./EmergencyKitScreen";
import { LockScreen } from "./LockScreen";
import { OnboardingScreen } from "./OnboardingScreen";
import { ResetMasterScreen } from "./ResetMasterScreen";

vi.mock("@/lib/window", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/window")>();
  return {
    ...actual,
    whenMainWindowReady: vi.fn(() => Promise.resolve()),
  };
});

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
    backupVault: vi.fn(async () => "/tmp/backup.dat"),
    backupVaultToChosenLocation: vi.fn(async () => "/tmp/chosen-backup.dat"),
    eraseVault: vi.fn(async () => {}),
    quitApp: vi.fn(async () => {}),
    lock: vi.fn(async () => {}),
    setAutoLock: vi.fn(async () => {}),
    changeMaster: vi.fn(async () => {}),
    regenerateRecovery: vi.fn(async () => ({
      app: "",
      recovery_code: "",
      instructions: "",
    })),
  },
}));

const api = vi.mocked(vaultApi);
const mockWhenReady = vi.mocked(whenMainWindowReady);

beforeEach(() => {
  vi.clearAllMocks();
  mockWhenReady.mockImplementation(() => Promise.resolve());
  useVaultStore.setState({
    status: "onboarding",
    model: null,
    migration: null,
    postMigrationStatus: "unlocked",
    incompatibleMessage: null,
    pendingKit: null,
    busy: false,
    error: null,
  });
});

describe("OnboardingScreen", () => {
  it("shows the full create-vault form without clipping key controls", () => {
    render(<OnboardingScreen />);

    expect(
      screen.getByRole("heading", { name: /welcome to keystash/i }),
    ).toBeVisible();
    expect(screen.getByLabelText("Master password")).toBeVisible();
    expect(screen.getByLabelText("Confirm password")).toBeVisible();
    expect(screen.getByRole("button", { name: /create vault/i })).toBeVisible();
  });

  it("focuses the password field after the main window finishes resizing", async () => {
    let resolveReady!: () => void;
    mockWhenReady.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveReady = resolve;
      }),
    );

    render(<OnboardingScreen />);
    const password = screen.getByLabelText("Master password");
    expect(password).not.toHaveFocus();

    resolveReady();
    await waitFor(() => expect(password).toHaveFocus());
  });

  it("accepts keyboard input after the main window finishes resizing", async () => {
    let resolveReady!: () => void;
    mockWhenReady.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveReady = resolve;
      }),
    );

    const user = userEvent.setup();
    render(<OnboardingScreen />);
    resolveReady();
    await waitFor(() =>
      expect(screen.getByLabelText("Master password")).toHaveFocus(),
    );

    await user.type(screen.getByLabelText("Master password"), "supersecret");
    await user.type(screen.getByLabelText("Confirm password"), "supersecret");
    expect(screen.getByLabelText("Master password")).toHaveValue("supersecret");
    expect(screen.getByLabelText("Confirm password")).toHaveValue(
      "supersecret",
    );
  });

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
  it("shows a loading state on the unlock button while unlocking", async () => {
    let resolveUnlock!: () => void;
    api.unlock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveUnlock = resolve;
        }),
    );

    const user = userEvent.setup();
    render(<LockScreen />);
    await user.type(screen.getByLabelText("Master password"), "pw");
    void user.click(screen.getByRole("button", { name: /^unlock$/i }));

    const loadingButton = await screen.findByRole("button", {
      name: /unlocking/i,
    });
    expect(loadingButton).toBeDisabled();
    expect(loadingButton).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Master password")).toBeDisabled();

    resolveUnlock();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^unlock$/i }),
      ).not.toHaveAttribute("aria-busy", "true"),
    );
  });

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

  it("shows a friendly error for a failed recovery unlock", async () => {
    api.unlockRecovery.mockRejectedValueOnce(new Error("nope"));
    const user = userEvent.setup();
    render(<LockScreen />);

    await user.click(screen.getByRole("button", { name: /recovery code/i }));
    await user.type(screen.getByLabelText("Recovery code"), "wrong words");
    await user.click(screen.getByRole("button", { name: /^unlock$/i }));

    expect(await screen.findByText(/recovery code didn't work/i)).toBeVisible();
  });
});

describe("EmergencyKitScreen", () => {
  it("copies the recovery code and requires a saved confirmation before continuing", async () => {
    useVaultStore.setState({
      pendingKit: {
        app: "keystash",
        recovery_code: "alpha beta gamma",
        instructions: "Save this somewhere safe.",
      },
    });

    const user = userEvent.setup();
    render(<EmergencyKitScreen />);

    const continueButton = screen.getByRole("button", { name: /continue/i });
    expect(continueButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /copy code/i }));
    expect(screen.getByRole("button", { name: /copied/i })).toBeVisible();
    await expect(navigator.clipboard.readText()).resolves.toBe(
      "alpha beta gamma",
    );

    await user.click(screen.getByRole("checkbox"));
    await user.click(continueButton);
    expect(useVaultStore.getState().pendingKit).toBeNull();
  });

  it("renders nothing when there is no pending kit", () => {
    const { container } = render(<EmergencyKitScreen />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("ResetMasterScreen", () => {
  it("validates length and confirmation before changing the master password", async () => {
    const user = userEvent.setup();
    render(<ResetMasterScreen />);

    await user.type(screen.getByLabelText("New master password"), "short");
    await user.type(screen.getByLabelText("Confirm password"), "short");
    await user.click(screen.getByRole("button", { name: /set password/i }));
    expect(screen.getByText(/at least 8/i)).toBeVisible();
    expect(api.changeMaster).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("New master password"));
    await user.clear(screen.getByLabelText("Confirm password"));
    await user.type(screen.getByLabelText("New master password"), "longenough");
    await user.type(screen.getByLabelText("Confirm password"), "different");
    await user.click(screen.getByRole("button", { name: /set password/i }));
    expect(screen.getByText(/don't match/i)).toBeVisible();
    expect(api.changeMaster).not.toHaveBeenCalled();
  });

  it("changes the master password and reports backend errors", async () => {
    const user = userEvent.setup();
    render(<ResetMasterScreen />);

    await user.type(screen.getByLabelText("New master password"), "longenough");
    await user.type(screen.getByLabelText("Confirm password"), "longenough");
    await user.click(screen.getByRole("button", { name: /set password/i }));
    expect(api.changeMaster).toHaveBeenCalledWith("longenough");

    api.changeMaster.mockRejectedValueOnce(new Error("re-wrap failed"));
    await user.click(screen.getByRole("button", { name: /set password/i }));
    expect(await screen.findByText(/re-wrap failed/i)).toBeVisible();
  });
});
