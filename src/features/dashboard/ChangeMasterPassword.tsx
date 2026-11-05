import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n";
import { toastSuccess } from "@/lib/toast";
import { vaultApi } from "@/vault/api";

/** The minimum the onboarding and recovery screens also enforce. */
const MIN_PASSWORD_LENGTH = 8;
/** How Rust reports a password that doesn't open the vault; every other failure is shown as it comes. */
const WRONG_PASSWORD_ERROR = "authentication failed";

const EMPTY_FORM = { current: "", next: "", confirm: "" };

/** Settings row for changing the master password, which opens into a form when asked. */
export function ChangeMasterPassword() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    setOpen(false);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function validationError(): string | null {
    if (form.next.length < MIN_PASSWORD_LENGTH) {
      return t("auth.passwordTooShort");
    }
    if (form.next !== form.confirm) return t("auth.passwordMismatch");
    if (form.next === form.current) return t("settings.masterPasswordSame");
    return null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const invalid = validationError();
    setError(invalid);
    if (invalid) return;

    setBusy(true);
    try {
      await vaultApi.changeMasterVerified(form.current, form.next);
      close();
      toastSuccess(t("settings.masterPasswordChanged"));
    } catch (failure) {
      const message = String(failure);
      setError(
        message.includes(WRONG_PASSWORD_ERROR)
          ? t("settings.masterPasswordWrong")
          : message,
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="flex-1 text-sm">{t("settings.masterPassword")}</span>
        <Button
          onClick={() => setOpen(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          {t("settings.masterPasswordChange")}
        </Button>
      </div>
    );
  }

  const field = (
    key: keyof typeof EMPTY_FORM,
    label: string,
    autoComplete: string,
  ) => (
    <Input
      aria-label={label}
      autoComplete={autoComplete}
      onChange={(event) =>
        setForm((current) => ({ ...current, [key]: event.target.value }))
      }
      placeholder={label}
      type="password"
      value={form[key]}
    />
  );

  return (
    <form className="flex flex-col gap-2 px-3 py-2.5" onSubmit={submit}>
      <p className="text-sm">{t("settings.masterPassword")}</p>
      {field(
        "current",
        t("settings.masterPasswordCurrent"),
        "current-password",
      )}
      {field("next", t("settings.masterPasswordNew"), "new-password")}
      {field("confirm", t("auth.confirmPassword"), "new-password")}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t("settings.masterPasswordHint")}
      </p>
      <div className="flex justify-end gap-2">
        <Button
          disabled={busy}
          onClick={close}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("common.cancel")}
        </Button>
        <Button disabled={busy || !form.current} size="sm" type="submit">
          {t(
            busy
              ? "settings.masterPasswordChanging"
              : "settings.masterPasswordSubmit",
          )}
        </Button>
      </div>
    </form>
  );
}
