import { describe, expect, it, vi } from "vitest";

import {
  collectScheduledReminders,
  runSchedulerTick,
  shouldNotifyReminder,
  type LastNotified,
  type ScheduledReminder,
} from "./scheduler";
import {
  createDefaultModel,
  ensureModuleDefaults,
  type VaultModel,
} from "@/vault/model";
import type { FeatureModule } from "@/modules/types";

const NOW = new Date("2026-07-08T12:00:00.000Z");

interface DummyItem {
  id: string;
  title: string;
}

const dummyModule: FeatureModule = {
  id: "dummy",
  title: "Dummy",
  icon: null,
  enabledByDefault: true,
  searchableByDefault: false,
  createEmpty: () => [],
  buildIndex: () => [],
  ListView: () => null,
  collectReminders: (items, now) =>
    (items as DummyItem[]).map((item) => ({
      id: item.id,
      title: item.title,
      body: now.toISOString(),
    })),
};

function modelWithDummy(enabled = true): VaultModel {
  const model = ensureModuleDefaults(createDefaultModel(NOW.toISOString()), [
    dummyModule,
  ]);
  return {
    ...model,
    settings: {
      ...model.settings,
      modules: { dummy: { enabled } },
    },
    modules: {
      dummy: [{ id: "one", title: "Dummy reminder" }],
    },
  };
}

describe("scheduler", () => {
  it("collects reminders from enabled modules and stamps module keys", () => {
    const reminders = collectScheduledReminders(
      modelWithDummy(),
      [dummyModule],
      NOW,
    );

    expect(reminders).toEqual([
      {
        id: "one",
        moduleId: "dummy",
        key: "dummy:one",
        title: "Dummy reminder",
        body: NOW.toISOString(),
      },
    ]);
  });

  it("skips disabled modules and non-array slices", () => {
    expect(
      collectScheduledReminders(modelWithDummy(false), [dummyModule], NOW),
    ).toEqual([]);
    expect(
      collectScheduledReminders(
        { ...modelWithDummy(), modules: { dummy: { not: "an array" } } },
        [dummyModule],
        NOW,
      ),
    ).toEqual([]);
  });

  it("de-dupes reminders after they have been sent once", () => {
    const reminder: ScheduledReminder = {
      id: "one",
      moduleId: "dummy",
      key: "dummy:one",
      title: "Dummy reminder",
    };
    const lastNotified: LastNotified = {
      "dummy:one": "2026-07-08T11:58:00.000Z",
    };

    expect(shouldNotifyReminder(reminder, lastNotified)).toBe(false);
    expect(shouldNotifyReminder(reminder, {})).toBe(true);
  });

  it("sends a due reminder once and updates last-notified only after notify succeeds", async () => {
    const notify = vi.fn(async () => {});

    const first = await runSchedulerTick({
      model: modelWithDummy(),
      modules: [dummyModule],
      lastNotified: {},
      now: NOW,
      notify,
    });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(first.sent.map((r) => r.key)).toEqual(["dummy:one"]);
    expect(first.lastNotified["dummy:one"]).toBe(NOW.toISOString());

    const second = await runSchedulerTick({
      model: modelWithDummy(),
      modules: [dummyModule],
      lastNotified: first.lastNotified,
      now: new Date("2026-07-08T12:30:00.000Z"),
      notify,
    });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(second.sent).toEqual([]);
  });

  it("does not mark a reminder notified when native notify fails", async () => {
    const notify = vi.fn(async () => {
      throw new Error("permission denied");
    });

    const result = await runSchedulerTick({
      model: modelWithDummy(),
      modules: [dummyModule],
      lastNotified: {},
      now: NOW,
      notify,
    });

    expect(result.sent).toEqual([]);
    expect(result.lastNotified).toEqual({});
  });
});
