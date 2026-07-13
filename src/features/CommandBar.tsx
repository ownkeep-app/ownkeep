import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CreditCard,
  Key,
  LayoutDashboard,
  ListTodo,
  Terminal,
  TrendingUp,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { AboutDialog } from "@/components/AboutDialog";
import { KeyboardHelp } from "@/components/KeyboardHelp";
import {
  COMMAND_BAR_SHORTCUTS,
  GLOBAL_SHORTCUTS,
} from "@/components/keyboard-shortcuts";
import { writeClipboard } from "@/lib/clipboard";
import { listItem, listStagger, motionOrUndefined } from "@/lib/motion";
import { runQuery, type RankedResult } from "@/lib/search";
import { toastClipboard, toastError, toastSecretCopied } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { hideWindow, openDashboard, openDashboardToModule } from "@/lib/window";
import { FillInForm } from "@/modules/commands/FillInForm";
import { commandEntries, parsePlaceholders } from "@/modules/commands/logic";
import {
  COMMANDS_MODULE_ID,
  type CommandEntry,
} from "@/modules/commands/types";
import { PASSWORDS_MODULE_ID } from "@/modules/passwords/types";
import { MODULES } from "@/modules/registry";
import type { FeatureModule } from "@/modules/types";
import { useShellStore } from "@/stores/shell-store";
import { useVaultStore } from "@/stores/vault-store";

/** Keep the bar visible briefly after a copy so the success toast can be read. */
export const COMMAND_BAR_HIDE_DELAY_MS = 2000;

/**
 * The launcher surface (spec §7): a search input over the unified index, results ranked by fuzzy ×
 * frecency (§7.2), numbered 1–9. A result's primary action runs via ⌥⇧<n> or Enter/click:
 * password → concealed-clipboard copy from Rust (§4.5); command → copy or inline fill-in (§7.3);
 * other modules → open the Dashboard on that module's pane. ⌥⌘<n> copies a command's raw template.
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
  const clearSeconds = useVaultStore(
    (state) => state.model?.settings.clipboardClearSeconds ?? 30,
  );
  const [filling, setFilling] = useState<CommandEntry | null>(null);
  const closingRef = useRef(false);
  const reduce = useReducedMotion();

  const results = useMemo(
    () => (model ? runQuery(model, modules, query) : []),
    [model, modules, query],
  );

  const finishAction = useCallback(
    async (id: string) => {
      if (closingRef.current) return;
      closingRef.current = true;
      try {
        await recordUse(id); // frecency reorders repeats (§7.2)
        // Hold the window so the copy toast is visible before the bar disappears.
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, COMMAND_BAR_HIDE_DELAY_MS);
        });
        setQuery("");
        await hideWindow();
      } finally {
        closingRef.current = false;
      }
    },
    [recordUse, setQuery],
  );

  /** Open the Dashboard and hide the launcher immediately (§7.6). */
  const goToDashboard = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    try {
      setQuery("");
      await openDashboard();
    } finally {
      closingRef.current = false;
    }
  }, [setQuery]);

  /** Open the Dashboard on a module pane and hide the launcher immediately (§7.6). */
  const browseInDashboard = useCallback(
    async (moduleId: string, itemId: string) => {
      if (closingRef.current) return;
      closingRef.current = true;
      try {
        await openDashboardToModule(moduleId);
        await recordUse(itemId);
        setQuery("");
        await hideWindow();
      } finally {
        closingRef.current = false;
      }
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

  const runPrimaryAction = useCallback(
    async (result: RankedResult) => {
      if (closingRef.current) return;
      const { entry } = result;
      const isPassword =
        entry.moduleId === PASSWORDS_MODULE_ID ||
        Boolean(
          modules.find((m) => m.id === entry.moduleId)?.secretFields?.[0],
        );
      const isCommand =
        entry.moduleId === COMMANDS_MODULE_ID || entry.type === "command";

      if (isPassword) {
        const secretField =
          modules.find((m) => m.id === entry.moduleId)?.secretFields?.[0] ??
          "password";
        try {
          await copySecret(entry.id, secretField);
          toastSecretCopied(clearSeconds);
        } catch {
          toastError("Couldn't copy the password.");
        }
        await finishAction(entry.id);
        return;
      }

      if (isCommand) {
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

      await browseInDashboard(entry.moduleId, entry.id);
    },
    [
      modules,
      copySecret,
      clearSeconds,
      finishAction,
      findCommand,
      browseInDashboard,
    ],
  );

  const copyRaw = useCallback(
    async (result: RankedResult) => {
      if (closingRef.current) return;
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
      if (closingRef.current) return;
      const index = resultIndexFromCode(event.code);
      if (index === null) return;
      const result = results[index];
      if (!result) return;

      // ⌥⇧1..9 = primary action; ⌥⌘1..9 = raw copy of a command template (§7.3).
      // Use event.code so Option/Shift alternate glyphs still map to Digit1–9.
      if (event.altKey && event.shiftKey && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        void runPrimaryAction(result);
      } else if (
        event.altKey &&
        event.metaKey &&
        !event.shiftKey &&
        !event.ctrlKey
      ) {
        event.preventDefault();
        void copyRaw(result);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [results, filling, runPrimaryAction, copyRaw]);

  if (filling) {
    const command = filling;
    return (
      <main className="flex h-screen items-start justify-center overflow-hidden bg-background px-5 py-2 text-foreground">
        <section className="w-full max-w-2xl rounded-lg border border-border bg-card text-card-foreground shadow-sm">
          <FillInForm
            arguments={command.arguments}
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
            template={command.primaryCopyTemplate}
            title={command.title}
          />
        </section>
      </main>
    );
  }

  return (
    <main className="relative flex h-screen items-start justify-center overflow-hidden bg-background px-5 py-2 text-foreground">
      <CommandBarBackdrop />
      <section className="relative z-10 w-full max-w-2xl">
        <Command
          shouldFilter={false}
          className="overflow-hidden rounded-lg border border-border bg-popover shadow-sm"
          label="Search keystash"
        >
          <div className="relative">
            <CommandInput
              aria-label="Search keystash"
              autoFocus
              className="h-16 text-xl"
              onValueChange={setQuery}
              placeholder="Search keystash"
              value={query}
              wrapperClassName="border-border/60 pr-3"
              trailing={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-1 size-10 shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Open Dashboard"
                  title="Dashboard (⌘⇧D)"
                  onClick={() => void goToDashboard()}
                >
                  <LayoutDashboard className="size-5" />
                </Button>
              }
            />
          </div>
          {results.length > 0 && (
            <CommandList className="max-h-[24.75rem]">
              <motion.div
                initial="initial"
                animate="animate"
                variants={motionOrUndefined(reduce, listStagger)}
              >
                {results.map((result, index) => (
                  <motion.div
                    key={result.entry.id}
                    variants={motionOrUndefined(reduce, listItem)}
                  >
                    <CommandItem
                      value={result.entry.id}
                      onSelect={() => void runPrimaryAction(result)}
                      className="min-h-11 gap-3 py-3"
                    >
                      <span
                        aria-hidden={index >= 9}
                        className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground"
                      >
                        {index < 9 ? `⌥⇧${index + 1}` : ""}
                      </span>
                      <span className="flex-1 truncate">
                        {result.entry.displayLine}
                      </span>
                    </CommandItem>
                  </motion.div>
                ))}
              </motion.div>
            </CommandList>
          )}
          {query.trim() !== "" && results.length === 0 && (
            <motion.div
              className="px-5 py-6 text-center text-sm text-muted-foreground"
              role="status"
              initial={motionOrUndefined(reduce, { opacity: 0 })}
              animate={{ opacity: 1 }}
            >
              No matches for “{query.trim()}”.
            </motion.div>
          )}
          {query.trim() === "" && results.length === 0 && <CommandIdleHint />}
        </Command>
      </section>
      <KeyboardHelp
        groups={[COMMAND_BAR_SHORTCUTS, GLOBAL_SHORTCUTS]}
        showTrigger={false}
      />
      <AboutDialog showTrigger={false} />
    </main>
  );
}

/** Soft window atmosphere behind the launcher card — icons/lines stay outside the content. */
function CommandBarBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="absolute -left-12 top-8 h-36 w-36 rounded-full bg-sky-400/15 blur-3xl dark:bg-sky-400/10" />
      <div className="absolute -right-8 bottom-10 h-40 w-40 rounded-full bg-amber-400/15 blur-3xl dark:bg-amber-400/10" />
      <div className="absolute bottom-0 left-1/3 h-28 w-28 rounded-full bg-emerald-400/10 blur-3xl dark:bg-emerald-400/8" />

      <CornerMarks className="absolute inset-3" />
      <AccentDashes className="absolute inset-x-8 bottom-4" />
      <AccentDashes className="absolute inset-x-16 top-3 opacity-70" />

      <CreditCard className="absolute left-5 top-5 size-7 text-rose-500/30 dark:text-rose-400/40" />
      <ListTodo className="absolute left-16 top-7 size-5 text-amber-500/28 dark:text-amber-400/38" />
      <TrendingUp className="absolute bottom-6 left-6 size-6 text-sky-500/28 dark:text-sky-400/38" />
      <Key className="absolute right-14 top-5 size-9 text-primary/30 dark:text-primary/42" />
      <Terminal className="absolute right-5 top-7 size-7 text-emerald-500/30 dark:text-emerald-400/40" />
      <CreditCard className="absolute bottom-5 right-16 size-5 text-rose-500/22 dark:text-rose-400/32" />
      <ListTodo className="absolute bottom-6 right-6 size-6 text-amber-500/25 dark:text-amber-400/35" />
    </div>
  );
}

/** Quiet empty-state cue under the input before the user types. */
function CommandIdleHint() {
  return (
    <div aria-hidden className="px-5 py-8 text-center">
      <p className="text-sm text-muted-foreground">
        Search passwords and commands
      </p>
      <p className="mt-1 text-xs text-muted-foreground/80">
        Use ⌥⇧1–9 to run a result
      </p>
    </div>
  );
}

/** L-shaped corner accents — readable on light and dark. */
function CornerMarks({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none", className)}>
      <span className="absolute left-0 top-0 h-5 w-5 rounded-tl-sm border-l-[2.5px] border-t-[2.5px] border-sky-400/45 dark:border-sky-400/55" />
      <span className="absolute right-0 top-0 h-5 w-5 rounded-tr-sm border-r-[2.5px] border-t-[2.5px] border-violet-400/40 dark:border-violet-400/50" />
      <span className="absolute bottom-0 left-0 h-5 w-5 rounded-bl-sm border-b-[2.5px] border-l-[2.5px] border-emerald-400/45 dark:border-emerald-400/55" />
      <span className="absolute bottom-0 right-0 h-5 w-5 rounded-br-sm border-b-[2.5px] border-r-[2.5px] border-amber-400/45 dark:border-amber-400/55" />
    </div>
  );
}

/** Short multicolor dashes along the bottom edge. */
function AccentDashes({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none flex items-center justify-center gap-1.5",
        className,
      )}
    >
      <span className="h-0.5 w-5 rounded-full bg-sky-400/55 dark:bg-sky-400/45" />
      <span className="h-0.5 w-3 rounded-full bg-emerald-400/55 dark:bg-emerald-400/45" />
      <span className="h-0.5 w-7 rounded-full bg-primary/45 dark:bg-primary/40" />
      <span className="h-0.5 w-3 rounded-full bg-amber-400/55 dark:bg-amber-400/45" />
      <span className="h-0.5 w-5 rounded-full bg-rose-400/50 dark:bg-rose-400/40" />
    </div>
  );
}

/** Map Digit1–Digit9 (physical keys) to a 0-based result index. */
function resultIndexFromCode(code: string): number | null {
  const match = /^Digit([1-9])$/.exec(code);
  return match ? Number(match[1]) - 1 : null;
}
