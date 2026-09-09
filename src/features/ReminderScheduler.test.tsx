import { act, render } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { ReminderScheduler } from "./ReminderScheduler";
import type { FeatureModule } from "@/modules/types";
import {
  createDefaultModel,
  ensureModuleDefaults,
  type VaultModel,
} from "@/vault/model";

const NOW = "2026-07-08T12:00:00.000Z";

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
  collectReminders: (items) =>
    (items as DummyItem[]).map((item) => ({
      id: item.id,
      title: item.title,
      body: "body",
    })),
};

async function flushScheduler() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function model(): VaultModel {
  const base = ensureModuleDefaults(createDefaultModel(NOW), [dummyModule]);
  return {
    ...base,
    settings: { ...base.settings, modules: { dummy: { enabled: true } } },
    modules: { dummy: [{ id: "one", title: "Dummy reminder" }] },
  };
}

describe("ReminderScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requests permission and sends a dummy reminder only once while it stays due", async () => {
    const requestPermission = vi.fn(async () => "granted");
    const sendNotification = vi.fn(async () => {});

    render(
      <ReminderScheduler
        enabled
        model={model()}
        modules={[dummyModule]}
        intervalMs={1_000}
        requestPermission={requestPermission}
        sendNotification={sendNotification}
      />,
    );

    await flushScheduler();
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledWith("Dummy reminder", "body");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(sendNotification).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-07-08T12:30:00.000Z"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it("stays quiet while disabled or when permission is denied", async () => {
    const requestPermission = vi.fn(async () => "denied");
    const sendNotification = vi.fn(async () => {});

    render(
      <ReminderScheduler
        enabled={false}
        model={model()}
        modules={[dummyModule]}
        intervalMs={1_000}
        requestPermission={requestPermission}
        sendNotification={sendNotification}
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(requestPermission).not.toHaveBeenCalled();

    render(
      <ReminderScheduler
        enabled
        model={model()}
        modules={[dummyModule]}
        intervalMs={1_000}
        requestPermission={requestPermission}
        sendNotification={sendNotification}
      />,
    );

    await flushScheduler();
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
