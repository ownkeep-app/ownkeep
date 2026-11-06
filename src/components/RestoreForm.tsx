import { type FormEvent, useState } from "react";
import { AlertTriangle, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useT } from "@/i18n";
import { toastSuccess } from "@/lib/toast";
import { useVaultStore } from "@/stores/vault-store";

type RestoreMode = "password" | "recovery";

/**
 * Restore a backup with its master password or recovery code; the file is picked next. Failures land
 * in the store's `error`, which the host screen shows.
 *
 * `replacesVault` is for a Mac that already has a vault: restoring then erases it, so say so.
 */
export function RestoreForm({ replacesVault }: { replacesVault: boolean }) {
  const { t } = useT();
  const busy = useVaultStore((s) => s.busy);
  const restoreWithPassword = useVaultStore((s) => s.restoreVaultWithPassword);
  const restoreWithRecovery = useVaultStore((s) => s.restoreVaultWithRecovery);
  const [mode, setMode] = useState<RestoreMode>("password");
  const [secret, setSecret] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = secret.trim();
    if (!value) return;
    try {
      const restoredPath =
        mode === "password"
          ? await restoreWithPassword(value)
          : await restoreWithRecovery(value);
      if (restoredPath) {
        toastSuccess(t("settings.restored", { path: restoredPath }));
      }
    } catch {
      // Already in the store's `error` for the host screen to show.
    } finally {
      setSecret("");
    }
  }

  return (
    <form className="flex w-full flex-col gap-2" onSubmit={onSubmit}>
      <div className="flex gap-2">
        <Select
          aria-label={t("settings.restoreCredentialType")}
          className="w-auto"
          onChange={(e) => setMode(e.target.value as RestoreMode)}
          value={mode}
        >
          <option value="password">{t("auth.masterPassword")}</option>
          <option value="recovery">{t("lock.recoveryCode")}</option>
        </Select>
        <Input
          aria-label={t(
            mode === "password"
              ? "settings.backupMasterPassword"
              : "settings.backupRecoveryCode",
          )}
          onChange={(e) => setSecret(e.target.value)}
          type={mode === "password" ? "password" : "text"}
          value={secret}
        />
      </div>
      {replacesVault && (
        <p className="flex items-start gap-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t("settings.restoreWarning")}</span>
        </p>
      )}
      <Button
        disabled={busy || !secret.trim()}
        type="submit"
        variant={replacesVault ? "destructive" : "default"}
      >
        <Upload className="h-4 w-4" />
        {t("settings.restore")}
      </Button>
    </form>
  );
}
