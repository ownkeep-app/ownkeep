import { type FormEvent, useEffect, useState } from "react";

import {
  AlertTriangle,
  Download,
  KeyRound,
  RotateCcw,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { MODULES } from "@/modules/registry";
import { useVaultStore } from "@/stores/vault-store";
import type { Theme } from "@/vault/model";

/** Auto-lock presets (spec §4.3/§9). `0` = never — the vault stays open until locked manually. */
const AUTO_LOCK_OPTIONS: { label: string; minutes: number }[] = [
  { label: "5 minutes", minutes: 5 },
  { label: "15 minutes", minutes: 15 },
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "3 hours", minutes: 180 },
  { label: "Never", minutes: 0 },
];

const CLIPBOARD_CLEAR_OPTIONS = [10, 30, 60, 120, 300];
const RESULT_LIMIT_OPTIONS = [3, 5, 7, 9];

type RestoreMode = "password" | "recovery";

/** Settings pane for backup/restore plus encrypted user preferences (spec §9/§11). */
export function SettingsPanel() {
  const model = useVaultStore((s) => s.model);
  const busy = useVaultStore((s) => s.busy);
  const error = useVaultStore((s) => s.error);
  const pendingKit = useVaultStore((s) => s.pendingKit);
  const setAutoLock = useVaultStore((s) => s.setAutoLock);
  const updateSettings = useVaultStore((s) => s.updateSettings);
  const backupVault = useVaultStore((s) => s.backupVault);
  const restoreVaultWithPassword = useVaultStore(
    (s) => s.restoreVaultWithPassword,
  );
  const restoreVaultWithRecovery = useVaultStore(
    (s) => s.restoreVaultWithRecovery,
  );
  const regenerateRecovery = useVaultStore((s) => s.regenerateRecovery);
  const dismissKit = useVaultStore((s) => s.dismissKit);
  const toggleModule = useVaultStore((s) => s.toggleModule);
  const [globalHotkey, setGlobalHotkey] = useState("");
  const [dashboardHotkey, setDashboardHotkey] = useState("");
  const [restoreMode, setRestoreMode] = useState<RestoreMode>("password");
  const [restoreSecret, setRestoreSecret] = useState("");
  const [kitSaved, setKitSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!model) return;
    setGlobalHotkey(model.settings.globalHotkey);
    setDashboardHotkey(model.settings.dashboardHotkey);
  }, [model]);

  if (!model) return null;

  const settings = model.settings;
  const autoLockMinutes = model.settings.autoLockMinutes;

  async function persistHotkeys() {
    const global = globalHotkey.trim() || settings.globalHotkey;
    const dashboard = dashboardHotkey.trim() || settings.dashboardHotkey;
    setGlobalHotkey(global);
    setDashboardHotkey(dashboard);
    if (
      global !== settings.globalHotkey ||
      dashboard !== settings.dashboardHotkey
    ) {
      await updateSettings({
        globalHotkey: global,
        dashboardHotkey: dashboard,
      });
    }
  }

  async function onBackup() {
    setMessage(null);
    const path = await backupVault();
    setMessage(path ? `Backup saved to ${path}` : "Backup canceled.");
  }

  async function onRestore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const secret = restoreSecret.trim();
    if (!secret) return;
    setMessage(null);
    const restoredPath =
      restoreMode === "password"
        ? await restoreVaultWithPassword(secret)
        : await restoreVaultWithRecovery(secret);
    setRestoreSecret("");
    setMessage(restoredPath ? `Vault restored from ${restoredPath}` : null);
  }

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Settings</h1>

      <div className="grid max-w-5xl gap-5 pt-5 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Security
          </h2>
          <div className="flex flex-col divide-y divide-border rounded-md border border-border">
            <label className="flex items-center gap-3 px-3 py-2.5">
              <span className="flex-1 text-sm">Auto-lock</span>
              <select
                aria-label="Auto-lock timeout"
                value={autoLockMinutes}
                onChange={(e) => void setAutoLock(Number(e.target.value))}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              >
                {AUTO_LOCK_OPTIONS.map((o) => (
                  <option key={o.minutes} value={o.minutes}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-3 px-3 py-2.5">
              <span className="flex-1 text-sm">Clipboard clear</span>
              <select
                aria-label="Clipboard clear seconds"
                value={settings.clipboardClearSeconds}
                onChange={(e) =>
                  void updateSettings({
                    clipboardClearSeconds: Number(e.target.value),
                  })
                }
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              >
                {CLIPBOARD_CLEAR_OPTIONS.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds}s
                  </option>
                ))}
              </select>
            </label>
          </div>
          {autoLockMinutes === 0 && (
            <p className="mt-2 text-xs text-destructive">
              With auto-lock off, the vault stays unlocked until you lock it
              manually or quit.
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Hotkeys
          </h2>
          <div className="flex flex-col gap-3 rounded-md border border-border p-3">
            <label className="flex flex-col gap-1.5 text-sm">
              Global hotkey
              <Input
                value={globalHotkey}
                onChange={(e) => setGlobalHotkey(e.target.value)}
                onBlur={() => void persistHotkeys()}
                aria-label="Global hotkey"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              Dashboard hotkey
              <Input
                value={dashboardHotkey}
                onChange={(e) => setDashboardHotkey(e.target.value)}
                onBlur={() => void persistHotkeys()}
                aria-label="Dashboard hotkey"
              />
            </label>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Appearance
          </h2>
          <div className="flex flex-col divide-y divide-border rounded-md border border-border">
            <label className="flex items-center gap-3 px-3 py-2.5">
              <span className="flex-1 text-sm">Theme</span>
              <select
                aria-label="Theme"
                value={settings.theme}
                onChange={(e) =>
                  void updateSettings({ theme: e.target.value as Theme })
                }
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label className="flex items-center gap-3 px-3 py-2.5">
              <span className="flex-1 text-sm">Accent</span>
              <Input
                type="color"
                value={settings.accent}
                onChange={(e) =>
                  void updateSettings({ accent: e.target.value })
                }
                aria-label="Accent color"
                className="h-9 w-16 p-1"
              />
            </label>
            <label className="flex items-center gap-3 px-3 py-2.5">
              <span className="flex-1 text-sm">Result limit</span>
              <select
                aria-label="Result limit"
                value={settings.resultLimit}
                onChange={(e) =>
                  void updateSettings({ resultLimit: Number(e.target.value) })
                }
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              >
                {RESULT_LIMIT_OPTIONS.map((limit) => (
                  <option key={limit} value={limit}>
                    {limit}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Backup & restore
          </h2>
          <div className="flex flex-col gap-3 rounded-md border border-border p-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => void onBackup()}
              disabled={busy}
            >
              <Download className="h-4 w-4" />
              Back up vault
            </Button>
            <form className="flex flex-col gap-2" onSubmit={onRestore}>
              <div className="flex gap-2">
                <select
                  aria-label="Restore credential type"
                  value={restoreMode}
                  onChange={(e) =>
                    setRestoreMode(e.target.value as RestoreMode)
                  }
                  className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                >
                  <option value="password">Master password</option>
                  <option value="recovery">Recovery code</option>
                </select>
                <Input
                  type={restoreMode === "password" ? "password" : "text"}
                  value={restoreSecret}
                  onChange={(e) => setRestoreSecret(e.target.value)}
                  aria-label={
                    restoreMode === "password"
                      ? "Backup master password"
                      : "Backup recovery code"
                  }
                />
              </div>
              <p className="flex items-start gap-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Restoring will permanently erase all current data. This cannot
                  be undone.
                </span>
              </p>
              <Button
                type="submit"
                variant="destructive"
                disabled={busy || !restoreSecret.trim()}
              >
                <Upload className="h-4 w-4" />
                Restore vault
              </Button>
            </form>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Emergency Kit
          </h2>
          <div className="flex flex-col gap-3 rounded-md border border-border p-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setKitSaved(false);
                void regenerateRecovery();
              }}
              disabled={busy}
            >
              <RotateCcw className="h-4 w-4" />
              Regenerate recovery code
            </Button>
            {pendingKit && (
              <div className="flex flex-col gap-3 rounded-md bg-muted p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <KeyRound className="h-4 w-4" />
                  New recovery code
                </div>
                <code className="select-all rounded-md border border-border bg-background p-2 font-mono text-xs leading-relaxed">
                  {pendingKit.recovery_code}
                </code>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={kitSaved}
                    onChange={(e) => setKitSaved(e.target.checked)}
                  />
                  I've saved this recovery code
                </label>
                <Button disabled={!kitSaved} onClick={dismissKit}>
                  Done
                </Button>
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Modules
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {MODULES.map((m) => {
              const enabled = model.settings.modules[m.id]?.enabled ?? false;
              return (
                <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                  {m.icon}
                  <span className="flex-1 text-sm">{m.title}</span>
                  <Switch
                    checked={enabled}
                    aria-label={`Enable ${m.title}`}
                    onCheckedChange={(v) => void toggleModule(m.id, v)}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {message && (
        <p className="mt-4 max-w-5xl break-all text-xs text-muted-foreground">
          {message}
        </p>
      )}
      {error && <p className="mt-4 text-xs text-destructive">{error}</p>}
    </div>
  );
}
