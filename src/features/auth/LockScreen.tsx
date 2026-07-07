import { type FormEvent, useState } from "react";

import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVaultStore } from "@/stores/vault-store";

/** Unlock with the master password, or fall back to the recovery code (→ forced new master, §4.1). */
export function LockScreen() {
  const unlock = useVaultStore((s) => s.unlock);
  const unlockRecovery = useVaultStore((s) => s.unlockRecovery);
  const busy = useVaultStore((s) => s.busy);
  const [recovery, setRecovery] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
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
    }
  }

  return (
    <Screen>
      <h1 className="text-xl font-semibold">keystash is locked</h1>
      <form onSubmit={onSubmit} className="flex w-full flex-col gap-3">
        {recovery ? (
          <textarea
            aria-label="Recovery code"
            autoFocus
            rows={3}
            className="rounded-md border border-border bg-transparent p-2 font-mono text-sm"
            placeholder="Your 12-word recovery code"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        ) : (
          <Input
            type="password"
            autoFocus
            aria-label="Master password"
            placeholder="Master password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy}>
          {busy ? "Unlocking…" : "Unlock"}
        </Button>
      </form>
      <button
        type="button"
        className="text-sm text-muted-foreground underline"
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
