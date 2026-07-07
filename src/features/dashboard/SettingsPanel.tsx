import { Switch } from "@/components/ui/switch";
import { MODULES } from "@/modules/registry";
import { useVaultStore } from "@/stores/vault-store";

/** Auto-lock presets (spec §4.3/§9). `0` = never — the vault stays open until locked manually. */
const AUTO_LOCK_OPTIONS: { label: string; minutes: number }[] = [
  { label: "5 minutes", minutes: 5 },
  { label: "15 minutes", minutes: 15 },
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "3 hours", minutes: 180 },
  { label: "Never", minutes: 0 },
];

/** Settings pane: security (auto-lock) + per-module enable toggles, persisted to the vault. */
export function SettingsPanel() {
  const model = useVaultStore((s) => s.model);
  const setAutoLock = useVaultStore((s) => s.setAutoLock);
  const toggleModule = useVaultStore((s) => s.toggleModule);

  if (!model) return null;

  const autoLockMinutes = model.settings.autoLockMinutes;

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Settings</h1>

      <h2 className="mb-3 mt-5 text-sm font-medium text-muted-foreground">
        Security
      </h2>
      <div className="flex max-w-md flex-col rounded-md border border-border">
        <label className="flex items-center gap-3 px-3 py-2.5">
          <span className="flex flex-1 flex-col">
            <span className="text-sm">Auto-lock</span>
            <span className="text-xs text-muted-foreground">
              Wipe keys after this much idle time.
            </span>
          </span>
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
      </div>
      {autoLockMinutes === 0 && (
        <p className="mt-2 max-w-md text-xs text-destructive">
          With auto-lock off, the vault stays unlocked until you lock it
          manually or quit.
        </p>
      )}

      <h2 className="mb-3 mt-5 text-sm font-medium text-muted-foreground">
        Modules
      </h2>
      <ul className="flex max-w-md flex-col divide-y divide-border rounded-md border border-border">
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
      <p className="mt-3 max-w-md text-xs text-muted-foreground">
        Disabling a module hides it everywhere but keeps its data in the
        encrypted vault.
      </p>
    </div>
  );
}
