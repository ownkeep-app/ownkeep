import { type FormEvent, useEffect, useRef, useState } from "react";

import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { whenMainWindowReady } from "@/lib/window";
import { useVaultStore } from "@/stores/vault-store";

/** Shown after a recovery-code unlock (§4.1 path B): the user must set a new master password. */
export function ResetMasterScreen() {
  const changeMaster = useVaultStore((s) => s.changeMaster);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
    try {
      await changeMaster(password);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <h1 className="text-xl font-semibold">Set a new master password</h1>
      <p className="text-sm text-muted-foreground">
        You unlocked with your recovery code. Choose a new master password to
        finish.
      </p>
      <form onSubmit={onSubmit} className="flex w-full flex-col gap-3">
        <Input
          ref={passwordRef}
          type="password"
          aria-label="New master password"
          placeholder="New master password"
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
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Set password"}
        </Button>
      </form>
    </Screen>
  );
}
