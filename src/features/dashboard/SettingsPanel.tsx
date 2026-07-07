import { Switch } from "@/components/ui/switch";
import { MODULES } from "@/modules/registry";
import { useVaultStore } from "@/stores/vault-store";

/** Settings → Modules tab: enable/disable each registered module (persisted to the vault). */
export function SettingsPanel() {
  const model = useVaultStore((s) => s.model);
  const toggleModule = useVaultStore((s) => s.toggleModule);

  if (!model) return null;

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Settings</h1>
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
