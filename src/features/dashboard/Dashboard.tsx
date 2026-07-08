import { type ReactNode, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import { Lock, Settings as SettingsIcon } from "lucide-react";

import { KeyboardHelp } from "@/components/KeyboardHelp";
import {
  DASHBOARD_SHORTCUTS,
  GLOBAL_SHORTCUTS,
} from "@/components/keyboard-shortcuts";
import { TAP_SCALE, motionOrUndefined, tapTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { MODULES } from "@/modules/registry";
import { useVaultStore } from "@/stores/vault-store";
import { APP_VERSION } from "@/vault/model";
import { SettingsPanel } from "./SettingsPanel";

const SETTINGS_KEY = "settings";

/** The persistent Dashboard window (spec §7.5): registry-driven sidebar + right content pane. */
export function Dashboard() {
  const status = useVaultStore((s) => s.status);
  const model = useVaultStore((s) => s.model);
  const lock = useVaultStore((s) => s.lock);
  const [selected, setSelected] = useState<string>("");

  const enabledModules = useMemo(
    () =>
      model ? MODULES.filter((m) => model.settings.modules[m.id]?.enabled) : [],
    [model],
  );

  // Sidebar keyboard nav: Cmd/Ctrl+1..9 jumps to the Nth module; ↑/↓ moves through the rows.
  useEffect(() => {
    const navKeys = [...enabledModules.map((m) => m.id), SETTINGS_KEY];
    function onKey(event: KeyboardEvent) {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key >= "1" &&
        event.key <= "9"
      ) {
        const target = enabledModules[Number(event.key) - 1];
        if (target) {
          setSelected(target.id);
          event.preventDefault();
        }
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        setSelected((prev) => {
          const current = prev || navKeys[0];
          const index = Math.max(0, navKeys.indexOf(current));
          const next =
            event.key === "ArrowDown"
              ? Math.min(index + 1, navKeys.length - 1)
              : Math.max(index - 1, 0);
          return navKeys[next];
        });
        event.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabledModules]);

  if (status !== "unlocked" || !model) {
    return (
      <main className="flex h-screen items-center justify-center bg-background p-6 text-center text-sm text-muted-foreground">
        <p role="status">
          keystash is locked. Unlock it from the main window (⌘⇧Space).
        </p>
      </main>
    );
  }

  const paneKey = selected || enabledModules[0]?.id || SETTINGS_KEY;
  const activeModule = enabledModules.find((m) => m.id === paneKey);
  const Pane = activeModule?.ListView;
  const slice = activeModule ? model.modules[activeModule.id] : undefined;
  const items = Array.isArray(slice) ? slice : [];

  return (
    <div className="flex h-screen bg-background text-foreground">
      <nav
        aria-label="Modules"
        className="flex w-56 flex-col gap-1 border-r border-border p-2"
      >
        <p className="px-2 py-1 text-xs font-medium uppercase text-muted-foreground">
          Modules
        </p>
        {enabledModules.map((m, i) => (
          <SidebarRow
            key={m.id}
            icon={m.icon}
            label={m.title}
            shortcut={`⌘${i + 1}`}
            active={paneKey === m.id}
            onClick={() => setSelected(m.id)}
          />
        ))}
        <div className="mt-auto flex flex-col gap-1 border-t border-border pt-1">
          <SidebarRow
            icon={<SettingsIcon className="h-4 w-4" />}
            label="Settings"
            active={paneKey === SETTINGS_KEY}
            onClick={() => setSelected(SETTINGS_KEY)}
          />
          <SidebarRow
            icon={<Lock className="h-4 w-4" />}
            label="Lock"
            onClick={() => void lock()}
          />
          <p className="px-2 pt-1 text-xs text-muted-foreground">
            keystash v{APP_VERSION}
          </p>
        </div>
      </nav>
      <section className="flex-1 overflow-auto">
        {Pane ? <Pane items={items} /> : <SettingsPanel />}
      </section>
      <KeyboardHelp groups={[DASHBOARD_SHORTCUTS, GLOBAL_SHORTCUTS]} />
    </div>
  );
}

function SidebarRow({
  icon,
  label,
  shortcut,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick: () => void;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
        active
          ? "bg-accent text-accent-foreground"
          : "text-foreground hover:bg-accent/50",
      )}
      transition={tapTransition}
      whileTap={motionOrUndefined(reduce, { scale: TAP_SCALE })}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {shortcut && (
        <span className="text-xs text-muted-foreground">{shortcut}</span>
      )}
    </motion.button>
  );
}
