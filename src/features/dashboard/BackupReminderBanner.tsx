import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT, type MessageKey } from "@/i18n";
import { backupReminder, type BackupReminder } from "@/lib/backup-reminder";
import { toastError, toastSuccess } from "@/lib/toast";
import { useVaultStore } from "@/stores/vault-store";

const MESSAGE_KEYS: Record<BackupReminder["kind"], MessageKey> = {
  never: "backupReminder.never",
  stale: "backupReminder.stale",
  changes: "backupReminder.changes",
};

/** A quiet nudge above the Dashboard's pane: offline, dismissible, and off with one setting (spec §11). */
export function BackupReminderBanner() {
  const { t } = useT();
  const model = useVaultStore((s) => s.model);
  const busy = useVaultStore((s) => s.busy);
  const backupVault = useVaultStore((s) => s.backupVault);
  const snooze = useVaultStore((s) => s.snoozeBackupReminder);

  const reminder = model && backupReminder(model, new Date());
  if (!reminder) return null;

  async function onBackup() {
    try {
      const path = await backupVault();
      if (path) toastSuccess(t("settings.backupSaved", { path }));
    } catch (error) {
      toastError(String(error));
    }
  }

  return (
    <div
      className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-2 text-sm"
      role="status"
    >
      <ShieldAlert className="h-4 w-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1">
        {t(MESSAGE_KEYS[reminder.kind], {
          days: reminder.kind === "stale" ? reminder.days : 0,
          count: reminder.kind === "changes" ? reminder.count : 0,
        })}
      </p>
      <Button
        disabled={busy}
        onClick={() => void snooze()}
        size="sm"
        type="button"
        variant="ghost"
      >
        {t("backupReminder.later")}
      </Button>
      <Button
        disabled={busy}
        onClick={() => void onBackup()}
        size="sm"
        type="button"
      >
        {t("backupReminder.backUp")}
      </Button>
    </div>
  );
}
