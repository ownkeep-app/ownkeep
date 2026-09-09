import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toastSuccess } from "@/lib/toast";
import { useVaultStore } from "@/stores/vault-store";
import { vaultApi } from "@/vault/api";
import { createDefaultModel } from "@/vault/model";
import { SettingsPanel } from "./SettingsPanel";

vi.mock("@/vault/api", () => ({
  vaultApi: {
    getVault: vi.fn(async () => "{}"),
    saveVault: vi.fn(async () => {}),
    setAutoLock: vi.fn(async () => {}),
    setHotkeys: vi.fn(async () => {}),
    backupVaultToChosenLocation: vi.fn(async () => "/tmp/backup.dat"),
    vaultPath: vi.fn(async () => "/tmp/vault.dat"),
    restoreVaultFromChosenLocationWithPassword: vi.fn(
      async () => "/tmp/restored.dat",
    ),
    restoreVaultFromChosenLocationWithRecovery: vi.fn(
      async () => "/tmp/restored.dat",
    ),
    lock: vi.fn(async () => {}),
    regenerateRecovery: vi.fn(async () => ({
      app: "OwnKeep",
      recovery_code: "fresh words",
      instructions: "Save it.",
    })),
    biometricStatus: vi.fn(async () => ({ available: true, enrolled: false })),
    enableBiometric: vi.fn(async () => {}),
    disableBiometric: vi.fn(async () => {}),
    reenrollBiometric: vi.fn(async () => {}),
  },
}));

vi.mock("@/lib/toast", () => ({
  toastSuccess: vi.fn(),
}));

const api = vi.mocked(vaultApi);
const successToast = vi.mocked(toastSuccess);

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
    fireEvent.click(screen.getByRole("tab", { name: "System" }));

    const select = screen.getByLabelText(
      "Auto-lock timeout",
    ) as HTMLSelectElement;
    expect(select.value).toBe("60"); // createDefaultModel default → 1 hour
    expect(screen.getByRole("option", { name: "Never" })).toBeInTheDocument();
  });

  it("persists a changed timeout and pushes it to the Rust session", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.click(screen.getByRole("tab", { name: "System" }));
    await user.selectOptions(screen.getByLabelText("Auto-lock timeout"), "0");

    const saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.settings.autoLockMinutes).toBe(0);
    expect(api.setAutoLock).toHaveBeenCalledWith(0);
  });

  it("keeps the default Settings menu focused and moves advanced controls to System", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(["Modules", "Hotkeys", "Categories", "Tags"]);
    expect(screen.getByRole("heading", { name: "Categories" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Tags" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Hotkeys" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Modules" })).toBeVisible();
    expect(screen.queryByLabelText("Auto-lock timeout")).toBeNull();
    expect(screen.queryByRole("button", { name: /back up vault/i })).toBeNull();

    await user.click(screen.getByRole("tab", { name: "System" }));

    expect(screen.getByLabelText("Auto-lock timeout")).toBeVisible();
    expect(screen.getByLabelText("Theme")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Vault file" })).toBeVisible();
    expect(screen.getByText(/vault file:/i)).toBeVisible();
    expect(
      screen.getByRole("button", { name: /back up vault/i }),
    ).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Modules" })).toBeNull();
  });

  it("persists hotkeys, clipboard clear, theme, accent, and result limit", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.clear(screen.getByLabelText("Global hotkey"));
    await user.type(screen.getByLabelText("Global hotkey"), "Cmd+Option+Space");
    await user.tab();

    await user.click(screen.getByRole("tab", { name: "System" }));
    await user.selectOptions(screen.getByLabelText("Clipboard clear seconds"), [
      "120",
    ]);
    await user.click(screen.getByRole("radio", { name: "Dark" }));
    fireEvent.change(screen.getByLabelText("Accent color"), {
      target: { value: "#00aa88" },
    });
    await user.selectOptions(screen.getByLabelText("Result limit"), ["5"]);

    const saved = api.saveVault.mock.calls.map((call) =>
      JSON.parse(call[0] as string),
    );
    expect(
      saved.some((model) => model.settings.globalHotkey === "Cmd+Option+Space"),
    ).toBe(true);
    expect(
      saved.some((model) => model.settings.clipboardClearSeconds === 120),
    ).toBe(true);
    expect(saved.some((model) => model.settings.theme === "dark")).toBe(true);
    expect(saved.some((model) => model.settings.accent === "#00aa88")).toBe(
      true,
    );
    expect(saved.some((model) => model.settings.resultLimit === 5)).toBe(true);
    expect(api.setHotkeys).toHaveBeenCalledWith(
      "Cmd+Option+Space",
      "Cmd+Shift+D",
    );
  });

  it("shows a success toast after saving taxonomy options", async () => {
    render(<SettingsPanel />);

    fireEvent.change(screen.getByLabelText("Category options"), {
      target: { value: "Work\nPersonal\nOps" },
    });
    fireEvent.blur(screen.getByLabelText("Category options"));

    await waitFor(() =>
      expect(successToast).toHaveBeenCalledWith(
        "Category and tag options saved.",
      ),
    );
    expect(
      screen.queryByText("Category and tag options saved."),
    ).not.toBeInTheDocument();
  });

  it("runs backup and password-gated restore from Settings", async () => {
    const user = userEvent.setup();
    api.getVault.mockResolvedValueOnce(
      JSON.stringify({ settings: { autoLockMinutes: 15 } }),
    );
    render(<SettingsPanel />);

    await user.click(screen.getByRole("tab", { name: "System" }));
    await user.click(screen.getByRole("button", { name: /back up vault/i }));
    expect(api.backupVaultToChosenLocation).toHaveBeenCalledWith(
      expect.stringMatching(/^ownkeep-v\d+\.\d+-/),
    );
    expect(successToast).toHaveBeenCalledWith(
      expect.stringMatching(/^Backup saved to /),
    );

    await user.type(screen.getByLabelText("Backup master password"), "pw");
    await user.click(screen.getByRole("button", { name: /restore vault/i }));

    expect(api.restoreVaultFromChosenLocationWithPassword).toHaveBeenCalledWith(
      "pw",
      expect.stringMatching(/^ownkeep-pre-restore-/),
    );
    expect(successToast).toHaveBeenCalledWith(
      expect.stringMatching(/^Vault restored from /),
    );
    expect(api.setAutoLock).toHaveBeenCalledWith(15);
  });

  it("shows canceled backup state and restores with a recovery code", async () => {
    const user = userEvent.setup();
    api.backupVaultToChosenLocation.mockResolvedValueOnce(null);
    api.getVault.mockResolvedValueOnce("{}");
    render(<SettingsPanel />);

    await user.click(screen.getByRole("tab", { name: "System" }));
    await user.click(screen.getByRole("button", { name: /back up vault/i }));
    expect(await screen.findByText(/backup canceled/i)).toBeVisible();

    await user.selectOptions(screen.getByLabelText("Restore credential type"), [
      "recovery",
    ]);
    await user.type(screen.getByLabelText("Backup recovery code"), "words");
    await user.click(screen.getByRole("button", { name: /restore vault/i }));

    expect(api.restoreVaultFromChosenLocationWithRecovery).toHaveBeenCalledWith(
      "words",
      expect.stringMatching(/^ownkeep-pre-restore-/),
    );
  });

  it("regenerates and dismisses a one-time Emergency Kit", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.click(screen.getByRole("tab", { name: "System" }));
    await user.click(
      screen.getByRole("button", { name: /regenerate recovery code/i }),
    );

    expect(await screen.findByText("fresh words")).toBeVisible();
    await user.click(screen.getByLabelText(/i've saved this recovery code/i));
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText("fresh words")).not.toBeInTheDocument();
  });

  it("shows the disabled-auto-lock warning and persists module toggles", async () => {
    useVaultStore.setState({
      model: {
        ...createDefaultModel("2026-07-07T00:00:00.000Z"),
        settings: {
          ...createDefaultModel("2026-07-07T00:00:00.000Z").settings,
          autoLockMinutes: 0,
        },
      },
    });

    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.click(screen.getByRole("switch", { name: /enable passwords/i }));

    const saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.settings.modules.passwords.enabled).toBe(true);

    await user.click(screen.getByRole("tab", { name: "System" }));
    expect(screen.getByText(/stays unlocked/i)).toBeVisible();
  });

  it("renders nothing before a model is loaded", () => {
    useVaultStore.setState({ model: null });

    const { container } = render(<SettingsPanel />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("SettingsPanel Touch ID (§4.7)", () => {
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

  it("enables Touch ID from the System → Security tab", async () => {
    api.biometricStatus.mockResolvedValue({ available: true, enrolled: false });
    const user = userEvent.setup();
    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole("tab", { name: "System" }));

    const toggle = await screen.findByRole("switch", {
      name: "Unlock with Touch ID",
    });
    await user.click(toggle);
    expect(api.enableBiometric).toHaveBeenCalled();
  });

  it("shows the backup-exclusion notice and can update or disable when enrolled", async () => {
    api.biometricStatus.mockResolvedValue({ available: true, enrolled: true });
    const user = userEvent.setup();
    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole("tab", { name: "System" }));

    expect(
      await screen.findByText(/isn't included in backups/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /update/i }));
    expect(api.reenrollBiometric).toHaveBeenCalled();

    await user.click(
      screen.getByRole("switch", { name: "Unlock with Touch ID" }),
    );
    expect(api.disableBiometric).toHaveBeenCalled();
  });

  it("marks Touch ID unavailable when there is no sensor", async () => {
    api.biometricStatus.mockResolvedValue({
      available: false,
      enrolled: false,
    });
    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole("tab", { name: "System" }));

    expect(
      await screen.findByText(/not available on this mac/i),
    ).toBeInTheDocument();
  });
});
