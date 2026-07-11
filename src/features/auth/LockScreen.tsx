import { type FormEvent, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Fingerprint, Loader2 } from "lucide-react";

import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { whenMainWindowReady } from "@/lib/window";
import { useVaultStore } from "@/stores/vault-store";

/** Unlock with the master password, or fall back to the recovery code (→ forced new master, §4.1). */
export function LockScreen() {
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
      setError(
        recovery ? "That recovery code didn't work." : "Wrong password.",
      );
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
      setError("Touch ID didn't work — enter your master password.");
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
      setError("Couldn't back up or erase the vault.");
    }
  }

  return (
    <Screen>
      <h1 className="text-xl font-semibold">keystash is locked</h1>
      {!startFresh && (
        <form onSubmit={onSubmit} className="flex w-full flex-col gap-3">
          {recovery ? (
            <textarea
              ref={recoveryRef}
              aria-label="Recovery code"
              rows={3}
              disabled={loading}
              className="rounded-md border border-border bg-transparent p-2 font-mono text-sm"
              placeholder="Your 12-word recovery code"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          ) : (
            <Input
              ref={passwordRef}
              type="password"
              aria-label="Master password"
              placeholder="Master password"
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
                Unlocking…
              </>
            ) : (
              "Unlock"
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
          Unlock with Touch ID
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
          {recovery
            ? "Use master password"
            : "Forgot password? Use recovery code"}
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
          Lost recovery code too?
        </button>
      )}
      {startFresh && (
        <div className="flex w-full flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-destructive">
            Back up this vault, then start fresh
          </p>
          <p className="text-muted-foreground">
            Save a copy of the encrypted vault file somewhere safe first. Then
            keystash erases the local vault so you can create a new empty one.
            Without the master password or recovery code, the backup stays
            encrypted and unreadable.
          </p>
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
                  {loading ? "Working…" : "Save copy & erase vault"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={() => setConfirmFresh(false)}
                >
                  Cancel
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
                  Back up & start fresh
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
                  Back
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Screen>
  );
}
