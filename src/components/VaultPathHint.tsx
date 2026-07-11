import { useEffect, useState } from "react";

import { vaultApi } from "@/vault/api";
import { PRODUCTION_VAULT_PATH } from "@/vault/paths";

/**
 * Read-only vault location for onboarding / Settings. Prefers the live absolute path from Rust;
 * falls back to the documented production path when IPC is unavailable (e.g. Vitest).
 */
export function VaultPathHint({ className }: { className?: string }) {
  const [path, setPath] = useState(PRODUCTION_VAULT_PATH);

  useEffect(() => {
    let active = true;
    void vaultApi
      .vaultPath()
      .then((resolved) => {
        if (active && resolved.trim()) setPath(resolved);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <p className={className}>
      Vault file:{" "}
      <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8em]">
        {path}
      </code>
    </p>
  );
}
