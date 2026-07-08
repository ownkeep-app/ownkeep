import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { KeyboardHelp } from "@/components/KeyboardHelp";
import {
  COMMAND_BAR_SHORTCUTS,
  GLOBAL_SHORTCUTS,
} from "@/components/keyboard-shortcuts";
import { writeClipboard } from "@/lib/clipboard";
import { runQuery, type RankedResult } from "@/lib/search";
import { toastClipboard, toastError, toastSecretCopied } from "@/lib/toast";
import { hideWindow } from "@/lib/window";
import { FillInForm } from "@/modules/commands/FillInForm";
import { commandEntries, parsePlaceholders } from "@/modules/commands/logic";
import {
  COMMANDS_MODULE_ID,
  type CommandEntry,
} from "@/modules/commands/types";
import { subscriptionEntries } from "@/modules/subscriptions/logic";
import {
  SUBSCRIPTIONS_MODULE_ID,
  type SubscriptionEntry,
} from "@/modules/subscriptions/types";
import { TODOS_MODULE_ID } from "@/modules/todos/types";
import { MODULES } from "@/modules/registry";
import type { FeatureModule } from "@/modules/types";
import { useShellStore } from "@/stores/shell-store";
import { useVaultStore } from "@/stores/vault-store";

/**
 * The launcher surface (spec §7): a search input over the unified index, results ranked by fuzzy ×
 * frecency (§7.2), numbered 1–9. A result's primary action runs via Cmd+<n> or Enter/click:
 * password → concealed-clipboard copy from Rust (§4.5); command → copy or inline fill-in (§7.3);
 * todo → toggle done; subscription → copy billing URL. Opt+Cmd+<n> copies a command's raw template.
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
  const toggleTodoDone = useVaultStore((state) => state.toggleTodoDone);
  const clearSeconds = useVaultStore(
    (state) => state.model?.settings.clipboardClearSeconds ?? 30,
  );
  const [filling, setFilling] = useState<CommandEntry | null>(null);

  const results = useMemo(
    () => (model ? runQuery(model, modules, query) : []),
    [model, modules, query],
  );

  const finishAction = useCallback(
    async (id: string) => {
      await recordUse(id); // frecency reorders repeats (§7.2)
      setQuery("");
      await hideWindow();
    },
    [recordUse, setQuery],
  );

  const findCommand = useCallback(
    (id: string): CommandEntry | undefined => {
      const slice = model?.modules[COMMANDS_MODULE_ID];
      return commandEntries(Array.isArray(slice) ? slice : []).find(
        (command) => command.id === id,
      );
    },
    [model],
  );

  const findSubscription = useCallback(
    (id: string): SubscriptionEntry | undefined => {
      const slice = model?.modules[SUBSCRIPTIONS_MODULE_ID];
      return subscriptionEntries(Array.isArray(slice) ? slice : []).find(
        (subscription) => subscription.id === id,
      );
    },
    [model],
  );

  const runPrimaryAction = useCallback(
    async (result: RankedResult) => {
      const { entry } = result;
      const secretField = modules.find((m) => m.id === entry.moduleId)
        ?.secretFields?.[0];
      if (secretField) {
        try {
          await copySecret(entry.id, secretField);
          toastSecretCopied(clearSeconds);
        } catch {
          toastError("Couldn't copy the password.");
        }
        await finishAction(entry.id);
        return;
      }
      if (entry.type === "command") {
        const command = findCommand(entry.id);
        if (command) {
          if (parsePlaceholders(command.primaryCopyTemplate).length > 0) {
            setFilling(command); // open the inline fill-in; the copy happens on submit (§7.3)
            return;
          }
          const ok = await writeClipboard(command.primaryCopyTemplate);
          toastClipboard(ok, "Command copied");
          await finishAction(entry.id);
          return;
        }
      }
      if (entry.type === "todo" && entry.moduleId === TODOS_MODULE_ID) {
        await toggleTodoDone(entry.id);
        await finishAction(entry.id);
        return;
      }
      if (
        entry.type === "subscription" &&
        entry.moduleId === SUBSCRIPTIONS_MODULE_ID
      ) {
        const subscription = findSubscription(entry.id);
        if (subscription?.url) {
          const ok = await writeClipboard(subscription.url);
          toastClipboard(ok, "Billing URL copied");
        }
        await finishAction(entry.id);
        return;
      }
      await finishAction(entry.id);
    },
    [
      modules,
      copySecret,
      clearSeconds,
      finishAction,
      findCommand,
      findSubscription,
      toggleTodoDone,
    ],
  );

  const copyRaw = useCallback(
    async (result: RankedResult) => {
      const command = findCommand(result.entry.id);
      if (!command) return;
      const ok = await writeClipboard(command.primaryCopyTemplate); // placeholders intact (§7.3)
      toastClipboard(ok, "Raw command copied");
      await finishAction(command.id);
    },
    [findCommand, finishAction],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (filling) setFilling(null);
        else void hideWindow();
        return;
      }
      // Cmd+1..9 = primary action; Opt+Cmd+1..9 = raw copy of a command template (§7.3).
      if (event.metaKey && event.key >= "1" && event.key <= "9") {
        const result = results[Number(event.key) - 1];
        if (result) {
          event.preventDefault();
          if (event.altKey) void copyRaw(result);
          else void runPrimaryAction(result);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [results, filling, runPrimaryAction, copyRaw]);

  if (filling) {
    const command = filling;
    return (
      <main className="flex h-screen items-start justify-center overflow-hidden bg-background px-5 py-2 text-foreground">
        <section className="w-full max-w-2xl rounded-lg border border-border shadow-sm">
          <FillInForm
            command={command}
            onCancel={() => setFilling(null)}
            onComplete={(filled) => {
              setFilling(null);
              void writeClipboard(filled).then((ok) => {
                toastClipboard(ok, "Command copied");
                return finishAction(command.id);
              });
            }}
            onRaw={() => {
              setFilling(null);
              void writeClipboard(command.primaryCopyTemplate).then((ok) => {
                toastClipboard(ok, "Raw command copied");
                return finishAction(command.id);
              });
            }}
          />
        </section>
      </main>
    );
  }

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
          {query.trim() !== "" && results.length === 0 && (
            <div
              className="px-5 py-6 text-center text-sm text-muted-foreground"
              role="status"
            >
              No matches for “{query.trim()}”.
            </div>
          )}
        </Command>
      </section>
      <KeyboardHelp
        groups={[COMMAND_BAR_SHORTCUTS, GLOBAL_SHORTCUTS]}
        showTrigger={false}
      />
    </main>
  );
}
