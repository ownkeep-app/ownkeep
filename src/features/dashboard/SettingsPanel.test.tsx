import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    restoreVaultFromChosenLocationWithPassword: vi.fn(
      async () => "/tmp/restored.dat",
    ),
    restoreVaultFromChosenLocationWithRecovery: vi.fn(
      async () => "/tmp/restored.dat",
    ),
    lock: vi.fn(async () => {}),
    regenerateRecovery: vi.fn(async () => ({
      app: "keystash",
      recovery_code: "fresh words",
      instructions: "Save it.",
    })),
  },
}));

const api = vi.mocked(vaultApi);

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
    const select = screen.getByLabelText(
      "Auto-lock timeout",
    ) as HTMLSelectElement;
    expect(select.value).toBe("60"); // createDefaultModel default → 1 hour
    expect(screen.getByRole("option", { name: "Never" })).toBeInTheDocument();
  });

  it("persists a changed timeout and pushes it to the Rust session", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.selectOptions(screen.getByLabelText("Auto-lock timeout"), "0");

    const saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.settings.autoLockMinutes).toBe(0);
    expect(api.setAutoLock).toHaveBeenCalledWith(0);
  });

  it("persists hotkeys, clipboard clear, theme, accent, and result limit", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.clear(screen.getByLabelText("Global hotkey"));
    await user.type(screen.getByLabelText("Global hotkey"), "Cmd+Option+Space");
    await user.tab();
    await user.selectOptions(screen.getByLabelText("Clipboard clear seconds"), [
      "120",
    ]);
    await user.selectOptions(screen.getByLabelText("Theme"), ["dark"]);
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

  it("runs backup and password-gated restore from Settings", async () => {
    const user = userEvent.setup();
    api.getVault.mockResolvedValueOnce(
      JSON.stringify({ settings: { autoLockMinutes: 15 } }),
    );
    render(<SettingsPanel />);

    await user.click(screen.getByRole("button", { name: /back up vault/i }));
    expect(api.backupVaultToChosenLocation).toHaveBeenCalledWith(
      expect.stringMatching(/^keystash-v0\.1-/),
    );
    expect(await screen.findByText(/backup saved/i)).toBeVisible();

    await user.type(screen.getByLabelText("Backup master password"), "pw");
    await user.click(screen.getByRole("button", { name: /restore vault/i }));

    expect(api.restoreVaultFromChosenLocationWithPassword).toHaveBeenCalledWith(
      "pw",
      expect.stringMatching(/^keystash-pre-restore-/),
    );
    expect(api.setAutoLock).toHaveBeenCalledWith(15);
  });

  it("shows canceled backup state and restores with a recovery code", async () => {
    const user = userEvent.setup();
    api.backupVaultToChosenLocation.mockResolvedValueOnce(null);
    api.getVault.mockResolvedValueOnce("{}");
    render(<SettingsPanel />);

    await user.click(screen.getByRole("button", { name: /back up vault/i }));
    expect(await screen.findByText(/backup canceled/i)).toBeVisible();

    await user.selectOptions(screen.getByLabelText("Restore credential type"), [
      "recovery",
    ]);
    await user.type(screen.getByLabelText("Backup recovery code"), "words");
    await user.click(screen.getByRole("button", { name: /restore vault/i }));

    expect(api.restoreVaultFromChosenLocationWithRecovery).toHaveBeenCalledWith(
      "words",
      expect.stringMatching(/^keystash-pre-restore-/),
    );
  });

  it("regenerates and dismisses a one-time Emergency Kit", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

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

    expect(screen.getByText(/stays unlocked/i)).toBeVisible();
    await user.click(screen.getByRole("switch", { name: /enable passwords/i }));

    const saved = JSON.parse(api.saveVault.mock.calls[0][0] as string);
    expect(saved.settings.modules.passwords.enabled).toBe(true);
  });

  it("renders nothing before a model is loaded", () => {
    useVaultStore.setState({ model: null });

    const { container } = render(<SettingsPanel />);

    expect(container).toBeEmptyDOMElement();
  });
});
