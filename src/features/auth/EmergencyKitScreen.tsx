import { useState } from "react";

import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { useVaultStore } from "@/stores/vault-store";

/** Shows the one-time recovery code (§4.6). The user must confirm they've saved it to continue. */
export function EmergencyKitScreen() {
  const kit = useVaultStore((s) => s.pendingKit);
  const dismiss = useVaultStore((s) => s.dismissKit);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!kit) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(kit!.recovery_code);
      setCopied(true);
    } catch {
      // Best-effort: the code is selectable above if the clipboard is unavailable.
    }
  }

  return (
    <Screen>
      <h1 className="text-xl font-semibold">Your recovery code</h1>
      <p className="text-sm text-muted-foreground">{kit.instructions}</p>
      <code className="w-full select-all rounded-md border border-border bg-muted p-3 font-mono text-sm leading-relaxed">
        {kit.recovery_code}
      </code>
      <Button variant="outline" onClick={copy}>
        {copied ? "Copied" : "Copy code"}
      </Button>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        I've saved my recovery code somewhere safe
      </label>
      <Button disabled={!saved} onClick={dismiss}>
        Continue
      </Button>
      <p className="text-xs text-muted-foreground">
        Summon keystash anytime with ⌘⇧Space; open the Dashboard with ⌘⇧D.
      </p>
    </Screen>
  );
}
