import { useCallback, useEffect, useMemo } from "react";

import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { runQuery, type RankedResult } from "@/lib/search";
import { hideWindow } from "@/lib/window";
import { MODULES } from "@/modules/registry";
import type { FeatureModule } from "@/modules/types";
import { useShellStore } from "@/stores/shell-store";
import { useVaultStore } from "@/stores/vault-store";

/**
 * The launcher surface on the main window (spec §7): one search input over the unified index, with
 * results ranked by fuzzy × frecency (§7.2), capped at `settings.resultLimit`, and numbered 1–9.
 * A result's primary action runs via the numbered copy hotkey (Cmd+<n>) or Enter/click — for a
 * password that is a concealed-clipboard copy from Rust, so plaintext never enters the WebView
 * (§4.5/§7.3) — then the launcher hides. `modules` is injectable for tests; production uses the
 * registry.
 */
export function CommandBar({
  modules = MODULES,
}: {
  modules?: FeatureModule[];
}) {
  const query = useShellStore((state) => state.query);
  const setQuery = useShellStore((state) => state.setQuery);
  const model = useVaultStore((state) => state.model);
  const copySecret = useVaultStore((state) => state.copySecret);
  const recordUse = useVaultStore((state) => state.recordUse);

  const results = useMemo(
    () => (model ? runQuery(model, modules, query) : []),
    [model, modules, query],
  );

  const runPrimaryAction = useCallback(
    async (result: RankedResult) => {
      const { entry } = result;
      const secretField = modules.find((m) => m.id === entry.moduleId)
        ?.secretFields?.[0];
      if (secretField) {
        await copySecret(entry.id, secretField);
      }
      // Frecency reorders repeats (§7.2); clear the query and hide so the next open is fresh (§7.3).
      await recordUse(entry.id);
      setQuery("");
      await hideWindow();
    },
    [modules, copySecret, recordUse, setQuery],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        void hideWindow();
        return;
      }
      // Cmd+1..9 runs the Nth result's primary action without opening the Dashboard (§7.3).
      if (event.metaKey && event.key >= "1" && event.key <= "9") {
        const result = results[Number(event.key) - 1];
        if (result) {
          event.preventDefault();
          void runPrimaryAction(result);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [results, runPrimaryAction]);

  return (
    <main className="flex h-screen items-start justify-center overflow-hidden bg-background px-5 py-2 text-foreground">
      <section className="w-full max-w-2xl">
        <Command
          shouldFilter={false}
          className="rounded-lg border border-border shadow-sm"
          label="Search keystash"
        >
          <CommandInput
            aria-label="Search keystash"
            autoFocus
            className="h-16 text-xl"
            onValueChange={setQuery}
            placeholder="Search keystash"
            value={query}
          />
          {results.length > 0 && (
            <CommandList>
              {results.map((result, index) => (
                <CommandItem
                  key={result.entry.id}
                  value={result.entry.id}
                  onSelect={() => void runPrimaryAction(result)}
                  className="gap-3"
                >
                  <span className="w-5 text-center text-xs text-muted-foreground">
                    {index < 9 ? index + 1 : ""}
                  </span>
                  <span className="flex-1 truncate">
                    {result.entry.displayLine}
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          )}
        </Command>
      </section>
    </main>
  );
}
