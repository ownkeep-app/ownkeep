import { type FormEvent, useEffect, useRef, useState } from "react";

import { Screen } from "@/components/screen";
import { VaultPathHint } from "@/components/VaultPathHint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n";
import { whenMainWindowReady } from "@/lib/window";
import { useVaultStore } from "@/stores/vault-store";

/** First-run: create the master password. The Emergency Kit is shown next (see App routing). */
export function OnboardingScreen() {
  const { t } = useT();
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
      setError(t("auth.passwordTooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.passwordMismatch"));
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
      <h1 className="text-xl font-semibold">{t("onboarding.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("onboarding.body")}</p>
      <VaultPathHint className="text-xs text-muted-foreground" />
      <form onSubmit={onSubmit} className="flex w-full flex-col gap-3">
        <Input
          ref={passwordRef}
          type="password"
          aria-label={t("auth.masterPassword")}
          placeholder={t("auth.masterPassword")}
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
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" aria-busy={busy} disabled={busy}>
          {busy ? t("onboarding.creating") : t("onboarding.create")}
        </Button>
      </form>
    </Screen>
  );
}
