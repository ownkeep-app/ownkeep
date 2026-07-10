import { toast } from "sonner";

/**
 * Centralized user feedback (spec §2.1). Copy/clipboard actions are keyboard-first and often hide
 * the window immediately, so success and failure are surfaced as ephemeral toasts rather than
 * inline text. Secrets are never included in a message — only the fact that a copy happened.
 */

export function toastCopied(label = "Copied to the clipboard"): void {
  toast.success(label);
}

export function toastSuccess(label: string): void {
  toast.success(label);
}

/** Feedback for a concealed-clipboard secret copy (§4.3): note the auto-clear window. */
export function toastSecretCopied(clearSeconds: number): void {
  toast.success("Password copied", {
    description:
      clearSeconds > 0
        ? `The clipboard clears in ${clearSeconds}s.`
        : "Remember to clear your clipboard when you are done.",
  });
}

export function toastError(label: string): void {
  toast.error(label);
}

/** Toast the outcome of a best-effort clipboard write (see `lib/clipboard`). */
export function toastClipboard(ok: boolean, label: string): void {
  if (ok) toast.success(label);
  else toast.error("Couldn't copy to the clipboard.");
}
