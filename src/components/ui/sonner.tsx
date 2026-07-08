import { Toaster as SonnerToaster } from "sonner";

import { useVaultStore } from "@/stores/vault-store";

/**
 * App-wide toast surface (spec §2.1). Mounted once per window in `main.tsx`; follows the vault's
 * theme setting so toasts match light/dark. sonner renders an `aria-live` region, so this also
 * gives assistive tech spoken feedback for copy/clipboard actions.
 */
export function Toaster() {
  const theme = useVaultStore((s) => s.model?.settings.theme ?? "system");
  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      richColors
      closeButton
    />
  );
}
