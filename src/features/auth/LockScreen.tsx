import { type FormEvent, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Loader2 } from "lucide-react";

import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { whenMainWindowReady } from "@/lib/window";
import { useVaultStore } from "@/stores/vault-store";

/** Unlock with the master password, or fall back to the recovery code (→ forced new master, §4.1). */
export function LockScreen() {
  const unlock = useVaultStore((s) => s.unlock);
  const unlockRecovery = useVaultStore((s) => s.unlockRecovery);
  const busy = useVaultStore((s) => s.busy);
  const [recovery, setRecovery] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const loading = unlocking || busy;
  const passwordRef = useRef<HTMLInputElement>(null);
  const recoveryRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void whenMainWindowReady().then(() => {
      (recovery ? recoveryRef : passwordRef).current?.focus();
    });
  }, [recovery]);

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

  return (
    <Screen>
      <h1 className="text-xl font-semibold">keystash is locked</h1>
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
    </Screen>
  );
}
