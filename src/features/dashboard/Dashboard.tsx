import { type ReactNode, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { motion, useReducedMotion } from "motion/react";

import { Keyboard, Lock, Settings as SettingsIcon } from "lucide-react";

import { KeyboardHelp } from "@/components/KeyboardHelp";
import {
  DASHBOARD_SHORTCUTS,
  GLOBAL_SHORTCUTS,
} from "@/components/keyboard-shortcuts";
import { LockScreen } from "@/features/auth/LockScreen";
import { OnboardingScreen } from "@/features/auth/OnboardingScreen";
import { ResetMasterScreen } from "@/features/auth/ResetMasterScreen";
import {
  IncompatibleVaultScreen,
  MigrationGuideScreen,
} from "@/features/migration/MigrationGuideScreen";
import {
  TAP_SCALE,
  fadeTransition,
  motionOrUndefined,
  tapTransition,
} from "@/lib/motion";
import { cn } from "@/lib/utils";
import { takeDashboardModule } from "@/lib/window";
import { MODULES } from "@/modules/registry";
import { useVaultStore } from "@/stores/vault-store";
import { APP_VERSION } from "@/vault/model";
import { SettingsPanel } from "./SettingsPanel";

const SETTINGS_KEY = "settings";
const DASHBOARD_OPEN_MODULE_EVENT = "dashboard-open-module";
/** Shared layoutId so the active pill slides between sidebar rows like ButtonGroup. */
const SIDEBAR_ACTIVE_LAYOUT_ID = "dashboard-sidebar-active";

/** The persistent Dashboard window (spec §7.5): registry-driven sidebar + right content pane. */
export function Dashboard() {
  const status = useVaultStore((s) => s.status);
  const model = useVaultStore((s) => s.model);
  const lock = useVaultStore((s) => s.lock);
  const [selected, setSelected] = useState<string>("");
  const [helpOpen, setHelpOpen] = useState(false);

  const enabledModules = useMemo(
    () =>
      model ? MODULES.filter((m) => model.settings.modules[m.id]?.enabled) : [],
    [model],
  );

  // Command-bar bridge (§7.6): select the module pane requested when opening the Dashboard.
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      const pending = await takeDashboardModule();
      if (!cancelled && pending) setSelected(pending);
      try {
        unlisten = await listen<string>(
          DASHBOARD_OPEN_MODULE_EVENT,
          (event) => {
            setSelected(event.payload);
          },
        );
      } catch {
        // Vitest / browser — no Tauri event bus.
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Sidebar keyboard nav: ⌥⇧1..9 jumps to the Nth module; ↑/↓ moves through the rows.
  useEffect(() => {
    const navKeys = [...enabledModules.map((m) => m.id), SETTINGS_KEY];
    function onKey(event: KeyboardEvent) {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        return;
      }
      // Same chord as the command-bar result hotkeys; use event.code so Option glyphs still map.
      if (event.altKey && event.shiftKey && !event.metaKey && !event.ctrlKey) {
        const match = /^Digit([1-9])$/.exec(event.code);
        if (match) {
          const target = enabledModules[Number(match[1]) - 1];
          if (target) {
            setSelected(target.id);
            event.preventDefault();
          }
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

  if (status === "loading") {
    return (
      <main className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        <p>Loading…</p>
      </main>
    );
  }

  if (status === "locked") {
    return <LockScreen />;
  }

  if (status === "onboarding") {
    return <OnboardingScreen />;
  }

  if (status === "reset") {
    return <ResetMasterScreen />;
  }

  if (status === "migration") {
    return <MigrationGuideScreen />;
  }

  if (status === "incompatible") {
    return <IncompatibleVaultScreen />;
  }

  if (status !== "unlocked" || !model) {
    return (
      <main className="flex h-screen items-center justify-center bg-background p-6 text-center text-sm text-muted-foreground">
        <p role="status">Unlock keystash to use the Dashboard.</p>
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
            shortcut={`⌥⇧${i + 1}`}
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
            icon={<Keyboard className="h-4 w-4" />}
            label="Help"
            shortcut="⌘/"
            onClick={() => setHelpOpen(true)}
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
      <KeyboardHelp
        groups={[DASHBOARD_SHORTCUTS, GLOBAL_SHORTCUTS]}
        onOpenChange={setHelpOpen}
        open={helpOpen}
        showTrigger={false}
      />
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
        "relative flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        active ? "text-foreground" : "text-foreground hover:bg-accent/50",
      )}
      transition={tapTransition}
      whileTap={motionOrUndefined(reduce, { scale: TAP_SCALE })}
    >
      {active && (
        <motion.span
          className="absolute inset-0 rounded-md bg-border dark:bg-muted"
          layoutId={SIDEBAR_ACTIVE_LAYOUT_ID}
          transition={fadeTransition}
          {...motionOrUndefined(reduce, { layout: true })}
        />
      )}
      <span className="relative z-10 flex min-w-0 flex-1 items-center gap-2">
        {icon}
        <span className="flex-1 truncate text-left">{label}</span>
        {shortcut && (
          <span className="text-xs text-muted-foreground">{shortcut}</span>
        )}
      </span>
    </motion.button>
  );
}
