import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toastError, toastSuccess } from "@/lib/toast";
import { useVaultStore } from "@/stores/vault-store";
import { vaultApi } from "@/vault/api";
import { createDefaultModel, type VaultModel } from "@/vault/model";
import { BackupReminderBanner } from "./BackupReminderBanner";

vi.mock("@/vault/api", () => ({
  vaultApi: {
    saveVault: vi.fn(async () => {}),
    backupVaultToChosenLocation: vi.fn(async () => "/tmp/backup.okbak"),
  },
}));

vi.mock("@/lib/toast", () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

const api = vi.mocked(vaultApi);
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) =>
  new Date(Date.now() - days * DAY).toISOString();

function model(
  settings: Partial<VaultModel["settings"]> = {},
  notes: unknown[] = [{ updatedAt: daysAgo(1) }],
): VaultModel {
  const base = createDefaultModel(daysAgo(60));
  return {
    ...base,
    settings: { ...base.settings, ...settings },
    modules: { notes },
  };
}

function show(next: VaultModel | null) {
  useVaultStore.setState({ status: "unlocked", model: next, busy: false });
  return render(<BackupReminderBanner />);
}

describe("BackupReminderBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stays hidden with no vault loaded, or nothing to remind about", () => {
    const { container, unmount } = show(null);
    expect(container).toBeEmptyDOMElement();
    unmount();
    expect(
      show(model({ backupReminderDays: 0 })).container,
    ).toBeEmptyDOMElement();
  });

  it("says why it's asking", () => {
    const never = show(model());
    expect(screen.getByRole("status")).toHaveTextContent(
      /haven't backed up this vault/i,
    );
    never.unmount();

    const stale = show(model({ lastBackupAt: daysAgo(45) }));
    expect(screen.getByRole("status")).toHaveTextContent(
      /last backup is 45 days old/i,
    );
    stale.unmount();

    show(
      model(
        { lastBackupAt: daysAgo(2) },
        Array.from({ length: 12 }, () => ({ updatedAt: daysAgo(1) })),
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      /since your last backup: 12/i,
    );
  });

  it("backs up from the banner, which then goes away", async () => {
    show(model());
    await userEvent.click(screen.getByRole("button", { name: /back up now/i }));

    expect(api.backupVaultToChosenLocation).toHaveBeenCalled();
    await waitFor(() =>
      expect(
        useVaultStore.getState().model?.settings.lastBackupAt,
      ).toBeTruthy(),
    );
    expect(toastSuccess).toHaveBeenCalledWith(
      "Backup saved to /tmp/backup.okbak",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("stays put when the file picker is canceled", async () => {
    api.backupVaultToChosenLocation.mockResolvedValueOnce(null);
    show(model());
    await userEvent.click(screen.getByRole("button", { name: /back up now/i }));

    await waitFor(() => expect(useVaultStore.getState().busy).toBe(false));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toBeVisible();
  });

  it("reports a failed backup", async () => {
    api.backupVaultToChosenLocation.mockRejectedValueOnce(
      new Error("disk full"),
    );
    show(model());
    await userEvent.click(screen.getByRole("button", { name: /back up now/i }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Error: disk full"),
    );
    expect(screen.getByRole("status")).toBeVisible();
  });

  it("hides for a while on Later", async () => {
    show(model());
    await userEvent.click(screen.getByRole("button", { name: /later/i }));

    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
    const until =
      useVaultStore.getState().model?.settings.backupReminderSnoozedUntil;
    expect(new Date(until!).getTime()).toBeGreaterThan(Date.now() + 6 * DAY);
    expect(api.saveVault).toHaveBeenCalled();
  });
});
