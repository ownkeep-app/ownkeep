import { type FormEvent, useEffect, useState } from "react";

import {
  AlertTriangle,
  Download,
  // Fingerprint, // Touch ID UI hidden until after v1.0 (spec §4.7)
  KeyRound,
  Monitor,
  RotateCcw,
  SlidersHorizontal,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ButtonGroup,
  type ButtonGroupOption,
} from "@/components/ui/button-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { VaultPathHint } from "@/components/VaultPathHint";
import { toastSuccess } from "@/lib/toast";
import { MODULES } from "@/modules/registry";
import { useVaultStore } from "@/stores/vault-store";
// import type { BiometricStatus } from "@/vault/api"; // Touch ID UI hidden until after v1.0
import type { Theme } from "@/vault/model";
import { parseOptionLines } from "@/vault/taxonomy";

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
type SettingsMenu = "settings" | "system";

const SETTINGS_MENUS: ButtonGroupOption<SettingsMenu>[] = [
  {
    value: "settings",
    label: "Settings",
    icon: <SlidersHorizontal className="h-4 w-4" />,
    controls: "settings-settings-panel",
  },
  {
    value: "system",
    label: "System",
    icon: <Monitor className="h-4 w-4" />,
    controls: "settings-system-panel",
  },
];

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
  const toggleModuleSearchable = useVaultStore((s) => s.toggleModuleSearchable);
  // Touch ID Settings UI deferred until after v1.0 (spec §4.7 still implemented in Rust).
  // const biometricStatus = useVaultStore((s) => s.biometricStatus);
  // const enableBiometric = useVaultStore((s) => s.enableBiometric);
  // const disableBiometric = useVaultStore((s) => s.disableBiometric);
  // const reenrollBiometric = useVaultStore((s) => s.reenrollBiometric);
  const [globalHotkey, setGlobalHotkey] = useState("");
  const [dashboardHotkey, setDashboardHotkey] = useState("");
  const [restoreMode, setRestoreMode] = useState<RestoreMode>("password");
  const [restoreSecret, setRestoreSecret] = useState("");
  const [kitSaved, setKitSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [categoryOptionsText, setCategoryOptionsText] = useState("");
  const [tagOptionsText, setTagOptionsText] = useState("");
  const [activeMenu, setActiveMenu] = useState<SettingsMenu>("settings");
  // const [biometric, setBiometric] = useState<BiometricStatus | null>(null);
  // const [biometricBusy, setBiometricBusy] = useState(false);

  useEffect(() => {
    if (!model) return;
    setGlobalHotkey(model.settings.globalHotkey);
    setDashboardHotkey(model.settings.dashboardHotkey);
    setCategoryOptionsText(model.settings.categoryOptions.join("\n"));
    setTagOptionsText(model.settings.tagOptions.join("\n"));
  }, [model]);

  // Touch ID status is device-local (spec §4.7), not part of the vault model, so query Rust for it.
  // const refreshBiometric = useCallback(async () => {
  //   try {
  //     setBiometric(await biometricStatus());
  //   } catch {
  //     setBiometric(null);
  //   }
  // }, [biometricStatus]);
  //
  // useEffect(() => {
  //   void refreshBiometric();
  // }, [refreshBiometric]);

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

  async function persistTaxonomy() {
    const categoryOptions = parseOptionLines(categoryOptionsText);
    const tagOptions = parseOptionLines(tagOptionsText);
    if (categoryOptions.length === 0 || tagOptions.length === 0) {
      setMessage("Category and tag option lists cannot be empty.");
      return;
    }
    setCategoryOptionsText(categoryOptions.join("\n"));
    setTagOptionsText(tagOptions.join("\n"));
    if (
      categoryOptions.join("\n") !== settings.categoryOptions.join("\n") ||
      tagOptions.join("\n") !== settings.tagOptions.join("\n")
    ) {
      await updateSettings({ categoryOptions, tagOptions });
      toastSuccess("Category and tag options saved.");
    }
  }

  async function onBackup() {
    setMessage(null);
    const path = await backupVault();
    if (path) {
      toastSuccess(`Backup saved to ${path}`);
    } else {
      setMessage("Backup canceled.");
    }
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
    if (restoredPath) {
      toastSuccess(`Vault restored from ${restoredPath}`);
    }
  }

  // async function onToggleBiometric(next: boolean) {
  //   setMessage(null);
  //   setBiometricBusy(true);
  //   try {
  //     if (next) {
  //       await enableBiometric();
  //       toastSuccess("Touch ID unlock enabled.");
  //     } else {
  //       await disableBiometric();
  //       toastSuccess("Touch ID unlock disabled.");
  //     }
  //   } catch {
  //     setMessage("Touch ID change didn't complete.");
  //   } finally {
  //     setBiometricBusy(false);
  //     await refreshBiometric();
  //   }
  // }
  //
  // async function onReenrollBiometric() {
  //   setMessage(null);
  //   setBiometricBusy(true);
  //   try {
  //     await reenrollBiometric();
  //     toastSuccess("Touch ID re-enrolled.");
  //   } catch {
  //     setMessage("Couldn't update Touch ID.");
  //   } finally {
  //     setBiometricBusy(false);
  //     await refreshBiometric();
  //   }
  // }

  return (
    <div className="p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">Settings</h1>
        <ButtonGroup
          aria-label="Settings menu"
          onValueChange={setActiveMenu}
          options={SETTINGS_MENUS}
          role="tablist"
          value={activeMenu}
        />
      </div>

      <div
        aria-label={`${activeMenu === "settings" ? "Primary" : "System"} settings`}
        className="grid max-w-5xl gap-5 pt-5 lg:grid-cols-2"
        id={`settings-${activeMenu}-panel`}
        role="tabpanel"
      >
        {activeMenu === "settings" ? (
          <>
            <section>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Modules
              </h2>
              <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                {MODULES.map((m) => {
                  const enabled =
                    model.settings.modules[m.id]?.enabled ?? false;
                  const searchable =
                    model.settings.modules[m.id]?.searchable === true;
                  return (
                    <li
                      key={m.id}
                      className="flex items-center gap-3 px-3 py-2.5"
                    >
                      {m.icon}
                      <span className="min-w-0 flex-1 text-sm">{m.title}</span>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        Search
                        <Switch
                          aria-label={`Include ${m.title} in search`}
                          checked={searchable}
                          onCheckedChange={(v) =>
                            void toggleModuleSearchable(m.id, v)
                          }
                        />
                      </label>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        Enabled
                        <Switch
                          aria-label={`Enable ${m.title}`}
                          checked={enabled}
                          onCheckedChange={(v) => void toggleModule(m.id, v)}
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Hotkeys
              </h2>
              <div className="flex flex-col gap-3 rounded-md border border-border p-3">
                <label className="flex flex-col gap-1.5 text-sm">
                  Global hotkey
                  <Input
                    aria-label="Global hotkey"
                    onBlur={() => void persistHotkeys()}
                    onChange={(e) => setGlobalHotkey(e.target.value)}
                    value={globalHotkey}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  Dashboard hotkey
                  <Input
                    aria-label="Dashboard hotkey"
                    onBlur={() => void persistHotkeys()}
                    onChange={(e) => setDashboardHotkey(e.target.value)}
                    value={dashboardHotkey}
                  />
                </label>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Categories
              </h2>
              <div className="rounded-md border border-border p-3">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Category options</span>
                  <span className="text-xs text-muted-foreground">
                    One label per line. Used as single-select choices when
                    editing items.
                  </span>
                  <textarea
                    aria-label="Category options"
                    className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onBlur={() => void persistTaxonomy()}
                    onChange={(event) =>
                      setCategoryOptionsText(event.target.value)
                    }
                    value={categoryOptionsText}
                  />
                </label>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Tags
              </h2>
              <div className="rounded-md border border-border p-3">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Tag options</span>
                  <span className="text-xs text-muted-foreground">
                    One label per line. Used as multi-select choices when
                    editing items.
                  </span>
                  <textarea
                    aria-label="Tag options"
                    className="min-h-36 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onBlur={() => void persistTaxonomy()}
                    onChange={(event) => setTagOptionsText(event.target.value)}
                    value={tagOptionsText}
                  />
                </label>
              </div>
            </section>
          </>
        ) : (
          <>
            <section>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Security
              </h2>
              <div className="flex flex-col divide-y divide-border rounded-md border border-border">
                <label className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex-1 text-sm">Auto-lock</span>
                  <Select
                    aria-label="Auto-lock timeout"
                    className="w-auto"
                    onChange={(e) => void setAutoLock(Number(e.target.value))}
                    value={autoLockMinutes}
                  >
                    {AUTO_LOCK_OPTIONS.map((o) => (
                      <option key={o.minutes} value={o.minutes}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex-1 text-sm">Clipboard clear</span>
                  <Select
                    aria-label="Clipboard clear seconds"
                    className="w-auto"
                    onChange={(e) =>
                      void updateSettings({
                        clipboardClearSeconds: Number(e.target.value),
                      })
                    }
                    value={settings.clipboardClearSeconds}
                  >
                    {CLIPBOARD_CLEAR_OPTIONS.map((seconds) => (
                      <option key={seconds} value={seconds}>
                        {seconds}s
                      </option>
                    ))}
                  </Select>
                </label>
                {/* Touch ID Settings UI deferred until after v1.0 (spec §4.7).
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex-1 text-sm">Unlock with Touch ID</span>
                  {biometric?.available ? (
                    <>
                      {biometric.enrolled && (
                        <Button
                          disabled={biometricBusy}
                          onClick={() => void onReenrollBiometric()}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Update
                        </Button>
                      )}
                      <Switch
                        aria-label="Unlock with Touch ID"
                        checked={biometric.enrolled}
                        onCheckedChange={(v) => {
                          if (!biometricBusy) void onToggleBiometric(v);
                        }}
                      />
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {biometric === null
                        ? "Checking…"
                        : "Not available on this Mac"}
                    </span>
                  )}
                </div>
                */}
              </div>
              {/* <p className="mt-2 text-xs text-muted-foreground">
                Touch ID is an optional shortcut — your master password and
                recovery code always unlock the vault.
              </p> */}
              {autoLockMinutes === 0 && (
                <p className="mt-2 text-xs text-destructive">
                  With auto-lock off, the vault stays unlocked until you lock it
                  manually or quit.
                </p>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Appearance
              </h2>
              <div className="flex flex-col divide-y divide-border rounded-md border border-border">
                <label className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex-1 text-sm">Theme</span>
                  <Select
                    aria-label="Theme"
                    className="w-auto"
                    onChange={(e) =>
                      void updateSettings({ theme: e.target.value as Theme })
                    }
                    value={settings.theme}
                  >
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </Select>
                </label>
                <label className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex-1 text-sm">Accent</span>
                  <Input
                    aria-label="Accent color"
                    className="h-9 w-16 p-1"
                    onChange={(e) =>
                      void updateSettings({ accent: e.target.value })
                    }
                    type="color"
                    value={settings.accent}
                  />
                </label>
                <label className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex-1 text-sm">Result limit</span>
                  <Select
                    aria-label="Result limit"
                    className="w-auto"
                    onChange={(e) =>
                      void updateSettings({
                        resultLimit: Number(e.target.value),
                      })
                    }
                    value={settings.resultLimit}
                  >
                    {RESULT_LIMIT_OPTIONS.map((limit) => (
                      <option key={limit} value={limit}>
                        {limit}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Vault file
              </h2>
              <div className="rounded-md border border-border p-3">
                <VaultPathHint className="text-sm text-muted-foreground" />
                <p className="mt-2 text-xs text-muted-foreground">
                  This encrypted file is outside the app bundle. Backups and
                  upgrades never move it — keep a separate copy somewhere safe.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Backup & restore
              </h2>
              <div className="flex flex-col gap-3 rounded-md border border-border p-3">
                <Button
                  disabled={busy}
                  onClick={() => void onBackup()}
                  type="button"
                  variant="outline"
                >
                  <Download className="h-4 w-4" />
                  Back up vault
                </Button>
                {/* Touch ID backup notice deferred with Settings UI until after v1.0.
                {biometric?.enrolled && (
                  <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Fingerprint className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Touch ID unlock isn't included in backups — you'll
                      re-enable it after restoring on the target Mac.
                    </span>
                  </p>
                )}
                */}
                <form className="flex flex-col gap-2" onSubmit={onRestore}>
                  <div className="flex gap-2">
                    <Select
                      aria-label="Restore credential type"
                      className="w-auto"
                      onChange={(e) =>
                        setRestoreMode(e.target.value as RestoreMode)
                      }
                      value={restoreMode}
                    >
                      <option value="password">Master password</option>
                      <option value="recovery">Recovery code</option>
                    </Select>
                    <Input
                      aria-label={
                        restoreMode === "password"
                          ? "Backup master password"
                          : "Backup recovery code"
                      }
                      onChange={(e) => setRestoreSecret(e.target.value)}
                      type={restoreMode === "password" ? "password" : "text"}
                      value={restoreSecret}
                    />
                  </div>
                  <p className="flex items-start gap-2 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Restoring will permanently erase all current data. This
                      cannot be undone.
                    </span>
                  </p>
                  <Button
                    disabled={busy || !restoreSecret.trim()}
                    type="submit"
                    variant="destructive"
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
                  disabled={busy}
                  onClick={() => {
                    setKitSaved(false);
                    void regenerateRecovery();
                  }}
                  type="button"
                  variant="outline"
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
                      <Checkbox
                        aria-label="I've saved this recovery code"
                        checked={kitSaved}
                        onCheckedChange={setKitSaved}
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
          </>
        )}
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
