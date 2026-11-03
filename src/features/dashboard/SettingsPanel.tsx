import { type FormEvent, useCallback, useEffect, useState } from "react";

import {
  AlertTriangle,
  Download,
  Fingerprint,
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
import {
  type LanguageSetting,
  type MessageKey,
  isLanguageSetting,
  useT,
} from "@/i18n";
import { toastSuccess } from "@/lib/toast";
import { MODULES } from "@/modules/registry";
import { useVaultStore } from "@/stores/vault-store";
import type { BiometricStatus } from "@/vault/api";
import type { Theme } from "@/vault/model";
import { parseOptionLines } from "@/vault/taxonomy";

/** Auto-lock presets (spec §4.3/§9). `0` = never — the vault stays open until locked manually. */
const AUTO_LOCK_OPTIONS: { labelKey: MessageKey; minutes: number }[] = [
  { labelKey: "settings.autoLock.5m", minutes: 5 },
  { labelKey: "settings.autoLock.15m", minutes: 15 },
  { labelKey: "settings.autoLock.30m", minutes: 30 },
  { labelKey: "settings.autoLock.1h", minutes: 60 },
  { labelKey: "settings.autoLock.3h", minutes: 180 },
  { labelKey: "settings.autoLock.never", minutes: 0 },
];

const THEME_OPTIONS: { value: Theme; labelKey: MessageKey }[] = [
  { value: "system", labelKey: "settings.theme.system" },
  { value: "light", labelKey: "settings.theme.light" },
  { value: "dark", labelKey: "settings.theme.dark" },
];

/** Locale names stay in their own language so either can be found from the other. */
const LANGUAGE_OPTIONS: { value: LanguageSetting; labelKey: MessageKey }[] = [
  { value: "system", labelKey: "settings.language.system" },
  { value: "en", labelKey: "settings.language.en" },
  { value: "zh-CN", labelKey: "settings.language.zhCN" },
];

const CLIPBOARD_CLEAR_OPTIONS = [10, 30, 60, 120, 300];
const RESULT_LIMIT_OPTIONS = [3, 5, 7, 9];

type RestoreMode = "password" | "recovery";
type SettingsMenu = "settings" | "system";

const SETTINGS_MENUS: (Omit<ButtonGroupOption<SettingsMenu>, "label"> & {
  labelKey: MessageKey;
})[] = [
  {
    value: "settings",
    labelKey: "settings.menu.settings",
    icon: <SlidersHorizontal className="h-4 w-4" />,
    controls: "settings-settings-panel",
  },
  {
    value: "system",
    labelKey: "settings.menu.system",
    icon: <Monitor className="h-4 w-4" />,
    controls: "settings-system-panel",
  },
];

/** Settings pane for backup/restore plus encrypted user preferences (spec §9/§11). */
export function SettingsPanel() {
  const { t } = useT();
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
  const biometricStatus = useVaultStore((s) => s.biometricStatus);
  const enableBiometric = useVaultStore((s) => s.enableBiometric);
  const disableBiometric = useVaultStore((s) => s.disableBiometric);
  const reenrollBiometric = useVaultStore((s) => s.reenrollBiometric);
  const [globalHotkey, setGlobalHotkey] = useState("");
  const [dashboardHotkey, setDashboardHotkey] = useState("");
  const [restoreMode, setRestoreMode] = useState<RestoreMode>("password");
  const [restoreSecret, setRestoreSecret] = useState("");
  const [kitSaved, setKitSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [categoryOptionsText, setCategoryOptionsText] = useState("");
  const [tagOptionsText, setTagOptionsText] = useState("");
  const [activeMenu, setActiveMenu] = useState<SettingsMenu>("settings");
  const [biometric, setBiometric] = useState<BiometricStatus | null>(null);
  const [biometricBusy, setBiometricBusy] = useState(false);

  useEffect(() => {
    if (!model) return;
    setGlobalHotkey(model.settings.globalHotkey);
    setDashboardHotkey(model.settings.dashboardHotkey);
    setCategoryOptionsText(model.settings.categoryOptions.join("\n"));
    setTagOptionsText(model.settings.tagOptions.join("\n"));
  }, [model]);

  // Touch ID status is device-local (spec §4.7), not part of the vault model, so query Rust for it.
  const refreshBiometric = useCallback(async () => {
    try {
      setBiometric(await biometricStatus());
    } catch {
      setBiometric(null);
    }
  }, [biometricStatus]);

  useEffect(() => {
    if (model) void refreshBiometric();
  }, [model, refreshBiometric]);

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
      setMessage(t("settings.taxonomyEmpty"));
      return;
    }
    setCategoryOptionsText(categoryOptions.join("\n"));
    setTagOptionsText(tagOptions.join("\n"));
    if (
      categoryOptions.join("\n") !== settings.categoryOptions.join("\n") ||
      tagOptions.join("\n") !== settings.tagOptions.join("\n")
    ) {
      await updateSettings({ categoryOptions, tagOptions });
      toastSuccess(t("settings.taxonomySaved"));
    }
  }

  async function onBackup() {
    setMessage(null);
    const path = await backupVault();
    if (path) {
      toastSuccess(t("settings.backupSaved", { path }));
    } else {
      setMessage(t("settings.backupCanceled"));
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
      toastSuccess(t("settings.restored", { path: restoredPath }));
    }
  }

  async function onToggleBiometric(next: boolean) {
    setMessage(null);
    setBiometricBusy(true);
    try {
      if (next) {
        await enableBiometric();
        toastSuccess(t("settings.touchIdEnabled"));
      } else {
        await disableBiometric();
        toastSuccess(t("settings.touchIdDisabled"));
      }
    } catch {
      setMessage(t("settings.touchIdToggleFailed"));
    } finally {
      setBiometricBusy(false);
      await refreshBiometric();
    }
  }

  async function onReenrollBiometric() {
    setMessage(null);
    setBiometricBusy(true);
    try {
      await reenrollBiometric();
      toastSuccess(t("settings.touchIdReenrolled"));
    } catch {
      setMessage(t("settings.touchIdReenrollFailed"));
    } finally {
      setBiometricBusy(false);
      await refreshBiometric();
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border bg-background px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">{t("dashboard.settings")}</h1>
        <ButtonGroup
          aria-label={t("settings.menu")}
          onValueChange={setActiveMenu}
          options={SETTINGS_MENUS.map(({ labelKey, ...option }) => ({
            ...option,
            label: t(labelKey),
          }))}
          role="tablist"
          value={activeMenu}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5">
        <div
          aria-label={t(
            activeMenu === "settings"
              ? "settings.primaryPanel"
              : "settings.systemPanel",
          )}
          className="grid max-w-5xl gap-5 lg:grid-cols-2"
          id={`settings-${activeMenu}-panel`}
          role="tabpanel"
        >
          {activeMenu === "settings" ? (
            <>
              <section>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                  {t("dashboard.modules")}
                </h2>
                <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-card">
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
                        <span className="min-w-0 flex-1 text-sm">
                          {t(m.titleKey)}
                        </span>
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          {t("settings.moduleSearch")}
                          <Switch
                            aria-label={t("settings.moduleSearchLabel", {
                              module: t(m.titleKey),
                            })}
                            checked={searchable}
                            onCheckedChange={(v) =>
                              void toggleModuleSearchable(m.id, v)
                            }
                          />
                        </label>
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          {t("settings.moduleEnabled")}
                          <Switch
                            aria-label={t("settings.moduleEnableLabel", {
                              module: t(m.titleKey),
                            })}
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
                  {t("settings.hotkeys")}
                </h2>
                <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
                  <label className="flex flex-col gap-1.5 text-sm">
                    {t("settings.globalHotkey")}
                    <Input
                      aria-label={t("settings.globalHotkey")}
                      onBlur={() => void persistHotkeys()}
                      onChange={(e) => setGlobalHotkey(e.target.value)}
                      value={globalHotkey}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    {t("settings.dashboardHotkey")}
                    <Input
                      aria-label={t("settings.dashboardHotkey")}
                      onBlur={() => void persistHotkeys()}
                      onChange={(e) => setDashboardHotkey(e.target.value)}
                      value={dashboardHotkey}
                    />
                  </label>
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                  {t("settings.categories")}
                </h2>
                <div className="rounded-md border border-border bg-card p-3">
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">
                      {t("settings.categoryOptions")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("settings.categoryOptionsHint")}
                    </span>
                    <textarea
                      aria-label={t("settings.categoryOptions")}
                      className="min-h-28 rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  {t("settings.tags")}
                </h2>
                <div className="rounded-md border border-border bg-card p-3">
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">
                      {t("settings.tagOptions")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("settings.tagOptionsHint")}
                    </span>
                    <textarea
                      aria-label={t("settings.tagOptions")}
                      className="min-h-36 rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onBlur={() => void persistTaxonomy()}
                      onChange={(event) =>
                        setTagOptionsText(event.target.value)
                      }
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
                  {t("settings.security")}
                </h2>
                <div className="flex flex-col divide-y divide-border rounded-md border border-border bg-card">
                  <label className="flex items-center gap-3 px-3 py-2.5">
                    <span className="flex-1 text-sm">
                      {t("settings.autoLock")}
                    </span>
                    <Select
                      aria-label={t("settings.autoLockTimeout")}
                      className="w-auto"
                      onChange={(e) => void setAutoLock(Number(e.target.value))}
                      value={autoLockMinutes}
                    >
                      {AUTO_LOCK_OPTIONS.map((o) => (
                        <option key={o.minutes} value={o.minutes}>
                          {t(o.labelKey)}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="flex items-center gap-3 px-3 py-2.5">
                    <span className="flex-1 text-sm">
                      {t("settings.clipboardClear")}
                    </span>
                    <Select
                      aria-label={t("settings.clipboardClearSeconds")}
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
                          {t("settings.seconds", { seconds })}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <span className="flex-1 text-sm">
                      {t("lock.unlockTouchId")}
                    </span>
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
                            {t("settings.touchIdUpdate")}
                          </Button>
                        )}
                        <Switch
                          aria-label={t("lock.unlockTouchId")}
                          checked={biometric.enrolled}
                          onCheckedChange={(v) => {
                            if (!biometricBusy) void onToggleBiometric(v);
                          }}
                        />
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {t(
                          biometric === null
                            ? "settings.touchIdChecking"
                            : "settings.touchIdUnavailable",
                        )}
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("settings.touchIdHint")}
                </p>
                {autoLockMinutes === 0 && (
                  <p className="mt-2 text-xs text-destructive">
                    {t("settings.autoLockOffWarning")}
                  </p>
                )}
              </section>

              <section>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                  {t("settings.appearance")}
                </h2>
                <div className="flex flex-col divide-y divide-border rounded-md border border-border bg-card">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <span className="flex-1 text-sm">
                      {t("settings.theme")}
                    </span>
                    <ButtonGroup
                      aria-label={t("settings.theme")}
                      onValueChange={(theme) => void updateSettings({ theme })}
                      options={THEME_OPTIONS.map(({ value, labelKey }) => ({
                        value,
                        label: t(labelKey),
                      }))}
                      value={settings.theme}
                    />
                  </div>
                  <label className="flex items-center gap-3 px-3 py-2.5">
                    <span className="flex-1 text-sm">
                      {t("settings.language")}
                    </span>
                    <Select
                      aria-label={t("settings.language")}
                      className="w-auto"
                      onChange={(e) => {
                        if (isLanguageSetting(e.target.value)) {
                          void updateSettings({ language: e.target.value });
                        }
                      }}
                      value={settings.language}
                    >
                      {LANGUAGE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {t(o.labelKey)}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="flex items-center gap-3 px-3 py-2.5">
                    <span className="flex-1 text-sm">
                      {t("settings.accent")}
                    </span>
                    <Input
                      aria-label={t("settings.accentColor")}
                      className="h-9 w-16 p-1"
                      onChange={(e) =>
                        void updateSettings({ accent: e.target.value })
                      }
                      type="color"
                      value={settings.accent}
                    />
                  </label>
                  <label className="flex items-center gap-3 px-3 py-2.5">
                    <span className="flex-1 text-sm">
                      {t("settings.resultLimit")}
                    </span>
                    <Select
                      aria-label={t("settings.resultLimit")}
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
                  {t("settings.vaultFile")}
                </h2>
                <div className="rounded-md border border-border bg-card p-3">
                  <VaultPathHint className="text-sm text-muted-foreground" />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("settings.vaultFileHint")}
                  </p>
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                  {t("settings.backupRestore")}
                </h2>
                <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
                  <Button
                    disabled={busy}
                    onClick={() => void onBackup()}
                    type="button"
                    variant="outline"
                  >
                    <Download className="h-4 w-4" />
                    {t("settings.backup")}
                  </Button>
                  {biometric?.enrolled && (
                    <p className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Fingerprint className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{t("settings.backupTouchIdNotice")}</span>
                    </p>
                  )}
                  <form className="flex flex-col gap-2" onSubmit={onRestore}>
                    <div className="flex gap-2">
                      <Select
                        aria-label={t("settings.restoreCredentialType")}
                        className="w-auto"
                        onChange={(e) =>
                          setRestoreMode(e.target.value as RestoreMode)
                        }
                        value={restoreMode}
                      >
                        <option value="password">
                          {t("auth.masterPassword")}
                        </option>
                        <option value="recovery">
                          {t("lock.recoveryCode")}
                        </option>
                      </Select>
                      <Input
                        aria-label={t(
                          restoreMode === "password"
                            ? "settings.backupMasterPassword"
                            : "settings.backupRecoveryCode",
                        )}
                        onChange={(e) => setRestoreSecret(e.target.value)}
                        type={restoreMode === "password" ? "password" : "text"}
                        value={restoreSecret}
                      />
                    </div>
                    <p className="flex items-start gap-2 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{t("settings.restoreWarning")}</span>
                    </p>
                    <Button
                      disabled={busy || !restoreSecret.trim()}
                      type="submit"
                      variant="destructive"
                    >
                      <Upload className="h-4 w-4" />
                      {t("settings.restore")}
                    </Button>
                  </form>
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                  {t("settings.emergencyKit")}
                </h2>
                <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
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
                    {t("settings.regenerateRecovery")}
                  </Button>
                  {pendingKit && (
                    <div className="flex flex-col gap-3 rounded-md bg-muted p-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <KeyRound className="h-4 w-4" />
                        {t("settings.newRecoveryCode")}
                      </div>
                      <code className="select-all rounded-md border border-border bg-card p-2 font-mono text-xs leading-relaxed">
                        {pendingKit.recovery_code}
                      </code>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          aria-label={t("settings.recoverySaved")}
                          checked={kitSaved}
                          onCheckedChange={setKitSaved}
                        />
                        {t("settings.recoverySaved")}
                      </label>
                      <Button disabled={!kitSaved} onClick={dismissKit}>
                        {t("common.done")}
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
    </div>
  );
}
