import { type FormEvent, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Fingerprint, Loader2 } from "lucide-react";

import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n";
import { whenMainWindowReady } from "@/lib/window";
import { useVaultStore } from "@/stores/vault-store";

/** Unlock with the master password, or fall back to the recovery code (→ forced new master, §4.1). */
export function LockScreen() {
  const { t } = useT();
  const unlock = useVaultStore((s) => s.unlock);
  const unlockRecovery = useVaultStore((s) => s.unlockRecovery);
  const unlockBiometric = useVaultStore((s) => s.unlockBiometric);
  const biometricStatus = useVaultStore((s) => s.biometricStatus);
  const backupLockedVaultAndStartFresh = useVaultStore(
    (s) => s.backupLockedVaultAndStartFresh,
  );
  const busy = useVaultStore((s) => s.busy);
  const [recovery, setRecovery] = useState(false);
  const [startFresh, setStartFresh] = useState(false);
  const [confirmFresh, setConfirmFresh] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [touchIdEnrolled, setTouchIdEnrolled] = useState(false);
  const loading = unlocking || busy;
  const passwordRef = useRef<HTMLInputElement>(null);
  const recoveryRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void whenMainWindowReady().then(() => {
      (recovery ? recoveryRef : passwordRef).current?.focus();
    });
  }, [recovery]);

  // Offer Touch ID (unlock path C, §4.7) only when the sensor is available and this vault is
  // enrolled; the master password + recovery code always remain the way in.
  useEffect(() => {
    let active = true;
    void biometricStatus()
      .then((status) => {
        if (active) setTouchIdEnrolled(status.available && status.enrolled);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [biometricStatus]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    flushSync(() => setUnlocking(true));
    try {
      if (recovery) {
        await unlockRecovery(value);
      } else {
        await unlock(value);
      }
    } catch {
      setError(t(recovery ? "lock.recoveryFailed" : "lock.wrongPassword"));
    } finally {
      setUnlocking(false);
    }
  }

  async function onTouchId() {
    setError(null);
    flushSync(() => setUnlocking(true));
    try {
      await unlockBiometric();
    } catch {
      setError(t("lock.touchIdFailed"));
    } finally {
      setUnlocking(false);
    }
  }

  async function onBackupAndStartFresh() {
    setError(null);
    try {
      const path = await backupLockedVaultAndStartFresh();
      if (!path) {
        setError(null);
      }
    } catch {
      setError(t("lock.startFreshFailed"));
    }
  }

  return (
    <Screen>
      <h1 className="text-xl font-semibold">{t("lock.title")}</h1>
      {!startFresh && (
        <form onSubmit={onSubmit} className="flex w-full flex-col gap-3">
          {recovery ? (
            <textarea
              ref={recoveryRef}
              aria-label={t("lock.recoveryCode")}
              rows={3}
              disabled={loading}
              className="rounded-md border border-border bg-card p-2 font-mono text-sm"
              placeholder={t("lock.recoveryCodePlaceholder")}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          ) : (
            <Input
              ref={passwordRef}
              type="password"
              aria-label={t("auth.masterPassword")}
              placeholder={t("auth.masterPassword")}
              disabled={loading}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} aria-busy={loading}>
            {loading ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                {t("lock.unlocking")}
              </>
            ) : (
              t("lock.unlock")
            )}
          </Button>
        </form>
      )}
      {touchIdEnrolled && !recovery && !startFresh && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={loading}
          aria-busy={loading}
          onClick={() => void onTouchId()}
        >
          <Fingerprint aria-hidden />
          {t("lock.unlockTouchId")}
        </Button>
      )}
      {!startFresh && (
        <button
          type="button"
          className="text-sm text-muted-foreground underline disabled:pointer-events-none disabled:opacity-50"
          disabled={loading}
          onClick={() => {
            setRecovery(!recovery);
            setValue("");
            setError(null);
          }}
        >
          {t(recovery ? "lock.useMasterPassword" : "lock.useRecoveryCode")}
        </button>
      )}
      {recovery && !startFresh && (
        <button
          type="button"
          className="text-sm text-muted-foreground underline disabled:pointer-events-none disabled:opacity-50"
          disabled={loading}
          onClick={() => {
            setStartFresh(true);
            setConfirmFresh(false);
            setError(null);
          }}
        >
          {t("lock.lostRecoveryCode")}
        </button>
      )}
      {startFresh && (
        <div className="flex w-full flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-destructive">
            {t("lock.startFreshTitle")}
          </p>
          <p className="text-muted-foreground">{t("lock.startFreshBody")}</p>
          {error && <p className="text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {confirmFresh ? (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={loading}
                  aria-busy={loading}
                  onClick={() => void onBackupAndStartFresh()}
                >
                  {loading ? t("common.working") : t("lock.saveCopyAndErase")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={() => setConfirmFresh(false)}
                >
                  {t("common.cancel")}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={loading}
                  onClick={() => setConfirmFresh(true)}
                >
                  {t("lock.backupAndStartFresh")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={() => {
                    setStartFresh(false);
                    setConfirmFresh(false);
                    setError(null);
                  }}
                >
                  {t("common.back")}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Screen>
  );
}
