import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { useT } from "@/i18n";
import { useVaultStore } from "@/stores/vault-store";
import { maxFileSizeMb, parseMaxFileSizeMb } from "./logic";

/** The Files module's Settings card: the per-file size limit, which `0` or blank turns off. */
export function FilesSettingsPanel() {
  const { t } = useT();
  const stored = useVaultStore((s) =>
    s.model ? maxFileSizeMb(s.model.settings) : 0,
  );
  const updateFilesSettings = useVaultStore((s) => s.updateFilesSettings);
  const [text, setText] = useState(String(stored));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => setText(String(stored)), [stored]);

  async function persist() {
    const next = parseMaxFileSizeMb(text);
    setInvalid(next === null);
    if (next === null) return;
    setText(String(next));
    if (next !== stored) await updateFilesSettings({ maxFileSizeMb: next });
  }

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <label className="grid gap-1 text-sm">
        <span className="font-medium">{t("files.maxSize")}</span>
        <span className="text-xs text-muted-foreground">
          {t("files.maxSizeHint")}
        </span>
        <Input
          aria-invalid={invalid}
          aria-label={t("files.maxSize")}
          inputMode="numeric"
          onBlur={() => void persist()}
          onChange={(event) => setText(event.target.value)}
          value={text}
        />
      </label>
      {invalid ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {t("files.maxSizeInvalid")}
        </p>
      ) : null}
    </div>
  );
}
