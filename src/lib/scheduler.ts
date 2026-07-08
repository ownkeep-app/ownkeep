import { isModuleEnabled, type VaultModel } from "@/vault/model";
import type { FeatureModule, ReminderEvent } from "@/modules/types";

export const SCHEDULER_INTERVAL_MS = 60_000;
export const REMINDER_DEDUPE_WINDOW_MS = 5 * 60_000;

export type LastNotified = Record<string, string>;

export interface ScheduledReminder extends ReminderEvent {
  moduleId: string;
  key: string;
}

export interface SchedulerTickResult {
  sent: ScheduledReminder[];
  lastNotified: LastNotified;
}

export type ReminderNotifier = (reminder: ScheduledReminder) => Promise<void>;

export function collectScheduledReminders(
  model: VaultModel,
  modules: FeatureModule[],
  now: Date,
): ScheduledReminder[] {
  return modules.flatMap((module) => {
    if (!isModuleEnabled(model, module.id) || !module.collectReminders) {
      return [];
    }
    const slice = model.modules[module.id];
    const items = Array.isArray(slice) ? slice : [];
    return module.collectReminders(items, now, model.settings).map((event) => ({
      ...event,
      moduleId: module.id,
      key: `${module.id}:${event.id}`,
    }));
  });
}

export function shouldNotifyReminder(
  reminder: ScheduledReminder,
  lastNotified: LastNotified,
  now: Date,
  windowMs = REMINDER_DEDUPE_WINDOW_MS,
): boolean {
  const last = lastNotified[reminder.key];
  if (!last) return true;
  const lastTime = Date.parse(last);
  return Number.isNaN(lastTime) || now.getTime() - lastTime >= windowMs;
}

export async function runSchedulerTick({
  model,
  modules,
  lastNotified,
  now,
  notify,
  windowMs = REMINDER_DEDUPE_WINDOW_MS,
}: {
  model: VaultModel;
  modules: FeatureModule[];
  lastNotified: LastNotified;
  now: Date;
  notify: ReminderNotifier;
  windowMs?: number;
}): Promise<SchedulerTickResult> {
  const nextLastNotified = { ...lastNotified };
  const sent: ScheduledReminder[] = [];
  const due = collectScheduledReminders(model, modules, now).filter(
    (reminder) =>
      shouldNotifyReminder(reminder, nextLastNotified, now, windowMs),
  );

  for (const reminder of due) {
    try {
      await notify(reminder);
      nextLastNotified[reminder.key] = now.toISOString();
      sent.push(reminder);
    } catch {
      // A notification failure should not poison the scheduler loop or mark the reminder done.
    }
  }

  return { sent, lastNotified: nextLastNotified };
}
