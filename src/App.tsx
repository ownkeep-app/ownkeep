import { useEffect, useLayoutEffect } from "react";

import { CommandBar } from "@/features/CommandBar";
import { EmergencyKitScreen } from "@/features/auth/EmergencyKitScreen";
import { LockScreen } from "@/features/auth/LockScreen";
import { OnboardingScreen } from "@/features/auth/OnboardingScreen";
import { ResetMasterScreen } from "@/features/auth/ResetMasterScreen";
import { Dashboard } from "@/features/dashboard/Dashboard";
import {
  IncompatibleVaultScreen,
  MigrationGuideScreen,
} from "@/features/migration/MigrationGuideScreen";
import {
  currentWindowLabel,
  mainWindowMode,
  setMainWindowMode,
} from "@/lib/window";
import { applyThemeSettings } from "@/lib/theme";
import { useVaultStore } from "@/stores/vault-store";

function Loading() {
  return (
    <main className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      <p>Loading…</p>
    </main>
  );
}

/**
 * Routes the two surfaces (§7.6). The Dashboard window shows the unlock form when locked, then the
 * browse/manage shell when unlocked; the main launcher window routes on the vault lifecycle. Both
 * share the Rust session as the source of truth and re-sync on window focus.
 */
function App() {
  const status = useVaultStore((s) => s.status);
  const pendingKit = useVaultStore((s) => s.pendingKit);
  const theme = useVaultStore((s) => s.model?.settings.theme ?? "system");
  const accent = useVaultStore((s) => s.model?.settings.accent ?? "#5B6CFF");
  const init = useVaultStore((s) => s.init);
  const label = currentWindowLabel();

  useEffect(() => {
    void init();
    const onFocus = () => void init();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [init]);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const apply = () => applyThemeSettings(theme, accent);
    apply();
    media?.addEventListener("change", apply);
    return () => media?.removeEventListener("change", apply);
  }, [theme, accent]);

  // Resize before paint when the active surface changes. Do not re-run on window focus —
  // redundant setSize steals keyboard focus from auth inputs on macOS.
  useLayoutEffect(() => {
    if (label !== "main") {
      return;
    }
    void setMainWindowMode(mainWindowMode(status, pendingKit));
  }, [label, status, pendingKit]);

  if (label === "dashboard") {
    return <Dashboard />;
  }

  switch (status) {
    case "onboarding":
      return <OnboardingScreen />;
    case "locked":
      return <LockScreen />;
    case "reset":
      return <ResetMasterScreen />;
    case "migration":
      return <MigrationGuideScreen />;
    case "incompatible":
      return <IncompatibleVaultScreen />;
    case "unlocked":
      return pendingKit ? <EmergencyKitScreen /> : <CommandBar />;
    default:
      return <Loading />;
  }
}

export default App;
