import { useEffect } from "react";

import { CommandBar } from "@/features/CommandBar";
import { EmergencyKitScreen } from "@/features/auth/EmergencyKitScreen";
import { LockScreen } from "@/features/auth/LockScreen";
import { OnboardingScreen } from "@/features/auth/OnboardingScreen";
import { ResetMasterScreen } from "@/features/auth/ResetMasterScreen";
import { Dashboard } from "@/features/dashboard/Dashboard";
import { currentWindowLabel } from "@/lib/window";
import { useVaultStore } from "@/stores/vault-store";

function Loading() {
  return (
    <main className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      <p>Loading…</p>
    </main>
  );
}

/**
 * Routes the two surfaces (§7.6). The Dashboard window always shows the Dashboard (which handles its
 * own locked state); the main launcher window routes on the vault lifecycle. Both share the Rust
 * session as the source of truth and re-sync on window focus.
 */
function App() {
  const status = useVaultStore((s) => s.status);
  const pendingKit = useVaultStore((s) => s.pendingKit);
  const init = useVaultStore((s) => s.init);
  const label = currentWindowLabel();

  useEffect(() => {
    void init();
    const onFocus = () => void init();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [init]);

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
    case "unlocked":
      return pendingKit ? <EmergencyKitScreen /> : <CommandBar />;
    default:
      return <Loading />;
  }
}

export default App;
