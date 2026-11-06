import { FILES_MODULE_ID } from "@/modules/files/types";
import type { VaultModel } from "@/vault/model";

export const BACKUP_REMINDER_DAY_OPTIONS = [0, 7, 14, 30, 90];
/** "Later" hides the reminder for this long, so it nudges without nagging. */
const SNOOZE_DAYS = 7;
/** A brand-new vault gets a day's grace before its first nudge. */
const NEW_VAULT_GRACE_DAYS = 1;
/** Enough changes to be worth backing up early, however recent the last backup is. */
const MANY_CHANGES = 10;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type BackupReminder =
  | { kind: "never" }
  | { kind: "stale"; days: number }
  | { kind: "changes"; count: number };

function vaultItems(model: VaultModel): [string, Record<string, unknown>][] {
  return Object.entries(model.modules).flatMap(([moduleId, slice]) =>
    Array.isArray(slice)
      ? slice.map(
          (item) =>
            [moduleId, item as Record<string, unknown>] as [
              string,
              Record<string, unknown>,
            ],
        )
      : [],
  );
}

const isAfter = (value: unknown, instant: string) =>
  typeof value === "string" && value > instant;

/**
 * What changed since `instant`. A stored file counts only when it's new: its contents can't change,
 * and retitling one isn't worth a backup. Deletions leave nothing to count, and don't lose data a
 * backup would have saved.
 */
function changesSince(model: VaultModel, instant: string) {
  let files = 0;
  let items = 0;
  for (const [moduleId, item] of vaultItems(model)) {
    if (moduleId === FILES_MODULE_ID) {
      if (isAfter(item.createdAt, instant)) files += 1;
    } else if (isAfter(item.updatedAt, instant)) {
      items += 1;
    }
  }
  return { files, items };
}

const daysBetween = (from: string, to: Date) =>
  Math.floor((to.getTime() - new Date(from).getTime()) / MS_PER_DAY);

/** Whether to nudge the user to back up right now, and why. Pure, so the Dashboard just renders it. */
export function backupReminder(
  model: VaultModel,
  now: Date,
): BackupReminder | null {
  const { backupReminderDays, backupReminderSnoozedUntil, lastBackupAt } =
    model.settings;
  if (backupReminderDays === 0) return null;
  if (
    backupReminderSnoozedUntil &&
    backupReminderSnoozedUntil > now.toISOString()
  ) {
    return null;
  }

  if (!lastBackupAt) {
    const isNew = daysBetween(model.meta.createdAt, now) < NEW_VAULT_GRACE_DAYS;
    return vaultItems(model).length > 0 && !isNew ? { kind: "never" } : null;
  }

  const { files, items } = changesSince(model, lastBackupAt);
  const count = files + items;
  if (count === 0) return null;
  // Stored files are often irreplaceable originals, so even one is worth backing up straight away.
  if (files > 0 || items >= MANY_CHANGES) return { kind: "changes", count };
  const days = daysBetween(lastBackupAt, now);
  return days >= backupReminderDays ? { kind: "stale", days } : null;
}

export function snoozedUntil(now: Date): string {
  return new Date(now.getTime() + SNOOZE_DAYS * MS_PER_DAY).toISOString();
}
