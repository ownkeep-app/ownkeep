import { toast } from "sonner";

import { t } from "@/i18n";

/**
 * Centralized user feedback (spec §2.1). Copy/clipboard actions are keyboard-first; the command
 * bar holds briefly after a copy so success/failure toasts can be read before the window hides.
 * Secrets are never included in a message — only the fact that a copy happened.
 */

export function toastCopied(label = t("toast.copied")): void {
  toast.success(label);
}

export function toastSuccess(label: string): void {
  toast.success(label);
}

/** Feedback for a concealed-clipboard secret copy (§4.3): note the auto-clear window. */
export function toastSecretCopied(clearSeconds: number): void {
  toast.success(t("toast.passwordCopied"), {
    description:
      clearSeconds > 0
        ? t("toast.clipboardClearsIn", { seconds: clearSeconds })
        : t("toast.clearClipboardReminder"),
  });
}

export function toastError(label: string): void {
  toast.error(label);
}

/** Toast the outcome of a best-effort clipboard write (see `lib/clipboard`). */
export function toastClipboard(ok: boolean, label: string): void {
  if (ok) toast.success(label);
  else toast.error(t("toast.copyFailed"));
}
