import { type FormEvent, useEffect, useRef, useState } from "react";

import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n";
import { whenMainWindowReady } from "@/lib/window";
import { useVaultStore } from "@/stores/vault-store";

/** Shown after a recovery-code unlock (§4.1 path B): the user must set a new master password. */
export function ResetMasterScreen() {
  const { t } = useT();
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
      setError(t("auth.passwordTooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.passwordMismatch"));
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
      <h1 className="text-xl font-semibold">{t("reset.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("reset.body")}</p>
      <form onSubmit={onSubmit} className="flex w-full flex-col gap-3">
        <Input
          ref={passwordRef}
          type="password"
          aria-label={t("reset.newPassword")}
          placeholder={t("reset.newPassword")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          type="password"
          aria-label={t("auth.confirmPassword")}
          placeholder={t("auth.confirmPassword")}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy}>
          {busy ? t("common.saving") : t("reset.submit")}
        </Button>
      </form>
    </Screen>
  );
}
