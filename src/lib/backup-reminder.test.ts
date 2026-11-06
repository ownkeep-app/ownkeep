import { describe, expect, it } from "vitest";

import { createDefaultModel, type VaultModel } from "@/vault/model";
import { backupReminder, snoozedUntil } from "./backup-reminder";

const NOW = new Date("2026-11-06T12:00:00.000Z");
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

function vault({
  createdDaysAgo = 100,
  settings = {},
  modules = {},
}: {
  createdDaysAgo?: number;
  settings?: Partial<VaultModel["settings"]>;
  modules?: Record<string, unknown>;
} = {}): VaultModel {
  const model = createDefaultModel(daysAgo(createdDaysAgo));
  return {
    ...model,
    settings: { ...model.settings, ...settings },
    modules,
  };
}

const notes = (count: number, updatedDaysAgo: number) =>
  Array.from({ length: count }, () => ({ updatedAt: daysAgo(updatedDaysAgo) }));

describe("backupReminder", () => {
  it("nudges a vault that has content and has never been backed up", () => {
    expect(
      backupReminder(vault({ modules: { notes: notes(1, 5) } }), NOW),
    ).toEqual({
      kind: "never",
    });
  });

  it("leaves an empty vault alone: there's nothing to lose yet", () => {
    expect(backupReminder(vault({ modules: { notes: [] } }), NOW)).toBeNull();
  });

  it("gives a brand-new vault a day's grace", () => {
    const model = vault({ createdDaysAgo: 0, modules: { notes: notes(1, 0) } });
    expect(backupReminder(model, NOW)).toBeNull();
  });

  it("stays quiet when nothing changed since the last backup, however old it is", () => {
    const model = vault({
      settings: { lastBackupAt: daysAgo(400) },
      modules: { notes: notes(3, 401) },
    });
    expect(backupReminder(model, NOW)).toBeNull();
  });

  it("nudges once the last backup is older than the interval and the vault has changed", () => {
    const changed = {
      modules: { notes: notes(1, 2) },
      settings: { lastBackupAt: daysAgo(30) },
    };
    expect(backupReminder(vault(changed), NOW)).toEqual({
      kind: "stale",
      days: 30,
    });
  });

  it("waits while the last backup is within the interval", () => {
    const model = vault({
      modules: { notes: notes(1, 2) },
      settings: { lastBackupAt: daysAgo(29) },
    });
    expect(backupReminder(model, NOW)).toBeNull();
  });

  it("follows the configured interval", () => {
    const model = vault({
      modules: { notes: notes(1, 2) },
      settings: { lastBackupAt: daysAgo(7), backupReminderDays: 7 },
    });
    expect(backupReminder(model, NOW)).toEqual({ kind: "stale", days: 7 });
  });

  it("nudges early for a newly stored file, which may be an irreplaceable original", () => {
    const model = vault({
      modules: { files: [{ createdAt: daysAgo(1), updatedAt: daysAgo(1) }] },
      settings: { lastBackupAt: daysAgo(2) },
    });
    expect(backupReminder(model, NOW)).toEqual({ kind: "changes", count: 1 });
  });

  it("doesn't count retitling an already backed-up file as a change", () => {
    const model = vault({
      modules: { files: [{ createdAt: daysAgo(9), updatedAt: daysAgo(1) }] },
      settings: { lastBackupAt: daysAgo(2) },
    });
    expect(backupReminder(model, NOW)).toBeNull();
  });

  it("nudges early once many items have changed, but not for a few", () => {
    const settings = { lastBackupAt: daysAgo(2) };
    expect(
      backupReminder(vault({ settings, modules: { notes: notes(9, 1) } }), NOW),
    ).toBeNull();
    expect(
      backupReminder(
        vault({ settings, modules: { notes: notes(10, 1) } }),
        NOW,
      ),
    ).toEqual({ kind: "changes", count: 10 });
  });

  it("ignores slices that aren't lists of items", () => {
    const model = vault({ modules: { legacy: { updatedAt: daysAgo(1) } } });
    expect(backupReminder(model, NOW)).toBeNull();
  });

  it("is silent when turned off", () => {
    const model = vault({
      modules: { notes: notes(1, 5) },
      settings: { backupReminderDays: 0 },
    });
    expect(backupReminder(model, NOW)).toBeNull();
  });

  it("is silent while snoozed, and returns when the snooze ends", () => {
    const modules = { notes: notes(1, 5) };
    const snoozed = vault({
      modules,
      settings: { backupReminderSnoozedUntil: snoozedUntil(NOW) },
    });
    expect(backupReminder(snoozed, NOW)).toBeNull();

    const later = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000 + 1);
    expect(backupReminder(snoozed, later)).toEqual({ kind: "never" });
  });
});
