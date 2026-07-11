import { type FormEvent, useEffect, useRef, useState } from "react";

import { Screen } from "@/components/screen";
import { VaultPathHint } from "@/components/VaultPathHint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { whenMainWindowReady } from "@/lib/window";
import { useVaultStore } from "@/stores/vault-store";

/** First-run: create the master password. The Emergency Kit is shown next (see App routing). */
export function OnboardingScreen() {
  const create = useVaultStore((s) => s.create);
  const busy = useVaultStore((s) => s.busy);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void whenMainWindowReady().then(() => passwordRef.current?.focus());
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    try {
      await create(password);
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <Screen>
      <h1 className="text-xl font-semibold">Welcome to keystash</h1>
      <p className="text-sm text-muted-foreground">
        Create a master password. It encrypts everything and is never stored —
        the only other way in is the recovery code you'll see next, so pick
        something strong and memorable.
      </p>
      <VaultPathHint className="text-xs text-muted-foreground" />
      <form onSubmit={onSubmit} className="flex w-full flex-col gap-3">
        <Input
          ref={passwordRef}
          type="password"
          aria-label="Master password"
          placeholder="Master password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          type="password"
          aria-label="Confirm password"
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" aria-busy={busy} disabled={busy}>
          {busy ? "Creating…" : "Create vault"}
        </Button>
      </form>
    </Screen>
  );
}
