import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import {
  modalOverlayClassName,
  modalPanelClassName,
} from "@/components/modal-styles";
import { Button } from "@/components/ui/button";
import { type MessageKey, useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/modules/files/logic";
import { vaultApi } from "@/vault/api";

/** A fast transfer finishes without flashing a dialog. */
const SHOW_AFTER_MS = 300;

const PROGRESS_EVENT = "file-transfer-progress";
const DONE_EVENT = "file-transfer-done";

interface Progress {
  kind: "import" | "export" | "backup" | "restore";
  name: string;
  done: number;
  total: number;
}

const TITLE_KEYS: Record<Progress["kind"], MessageKey> = {
  import: "transfer.import",
  export: "transfer.export",
  backup: "transfer.backup",
  restore: "transfer.restore",
};

/**
 * Progress and Cancel for the long file operations (add, save a copy, backup, restore). Mounted at the
 * app root because a backup can start from Settings, the migration guide, or the lock screen. It covers
 * the window while running, which also keeps the user from changing files underneath a backup.
 */
export function TransferProgress() {
  const { t } = useT();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [visible, setVisible] = useState(false);
  const running = progress !== null;

  useEffect(() => {
    const unlisten = [
      listen<Progress>(PROGRESS_EVENT, (event) => setProgress(event.payload)),
      listen(DONE_EVENT, () => {
        setProgress(null);
        setVisible(false);
      }),
    ];
    return () => {
      for (const pending of unlisten) void pending.then((stop) => stop());
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [running]);

  if (!progress || !visible) return null;

  const percent =
    progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : 0;

  return (
    <div
      aria-label={t(TITLE_KEYS[progress.kind])}
      aria-modal="true"
      className={cn(modalOverlayClassName, "z-[70]")}
      role="dialog"
    >
      <div className={cn(modalPanelClassName, "w-full max-w-md p-5")}>
        <h2 className="text-sm font-medium">{t(TITLE_KEYS[progress.kind])}</h2>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {progress.name}
        </p>
        <div
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percent}
          className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
        >
          <div
            className="h-full bg-primary transition-[width]"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs tabular-nums text-muted-foreground">
            {formatBytes(progress.done)} / {formatBytes(progress.total)}
          </p>
          <Button
            onClick={() => void vaultApi.cancelTransfer()}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}
