import { useEffect, useRef } from "react";

import {
  runSchedulerTick,
  SCHEDULER_INTERVAL_MS,
  type LastNotified,
  type ReminderNotifier,
} from "@/lib/scheduler";
import { MODULES } from "@/modules/registry";
import type { FeatureModule } from "@/modules/types";
import { vaultApi } from "@/vault/api";
import type { VaultModel } from "@/vault/model";

export function ReminderScheduler({
  enabled,
  model,
  modules = MODULES,
  intervalMs = SCHEDULER_INTERVAL_MS,
  requestPermission = vaultApi.requestNotificationPermission,
  sendNotification = vaultApi.sendNotification,
}: {
  enabled: boolean;
  model: VaultModel | null;
  modules?: FeatureModule[];
  intervalMs?: number;
  requestPermission?: () => Promise<string>;
  sendNotification?: (title: string, body?: string) => Promise<void>;
}) {
  const lastNotified = useRef<LastNotified>({});
  const permission = useRef<string | null>(null);

  useEffect(() => {
    const currentModel = model;
    if (!enabled || !currentModel) return;
    const activeModel = currentModel;

    let stopped = false;
    const notify: ReminderNotifier = async (reminder) => {
      if (permission.current === null) {
        permission.current = await requestPermission();
      }
      if (permission.current !== "granted") {
        throw new Error("notification permission denied");
      }
      await sendNotification(reminder.title, reminder.body);
    };

    async function tick() {
      if (stopped) return;
      const result = await runSchedulerTick({
        model: activeModel,
        modules,
        lastNotified: lastNotified.current,
        now: new Date(),
        notify,
      });
      lastNotified.current = result.lastNotified;
    }

    const run = () => void tick();
    run();
    const interval = window.setInterval(run, intervalMs);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);

    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [
    enabled,
    intervalMs,
    model,
    modules,
    requestPermission,
    sendNotification,
  ]);

  return null;
}
