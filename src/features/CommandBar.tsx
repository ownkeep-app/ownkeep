import { useEffect } from "react";

import { Command, CommandInput } from "@/components/ui/command";
import { hideWindow } from "@/lib/window";
import { useShellStore } from "@/stores/shell-store";

/**
 * The launcher surface on the main window (spec §7). Phase 2 is the empty search shell; live
 * fuzzy+frecency results over the unified index arrive in Phase 4.
 */
export function CommandBar() {
  const query = useShellStore((state) => state.query);
  const setQuery = useShellStore((state) => state.setQuery);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        void hideWindow();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <main className="flex h-screen items-center justify-center overflow-hidden bg-background px-5 py-2 text-foreground">
      <section className="w-full max-w-2xl">
        <Command
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
        </Command>
      </section>
    </main>
  );
}
