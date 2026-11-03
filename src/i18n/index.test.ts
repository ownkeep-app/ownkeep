import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MIGRATION_NOTE_PREFIX } from "@/features/migration/MigrationGuideScreen";
import { MIGRATIONS } from "@/vault/migrations";

import {
  currentLocale,
  isLanguageSetting,
  isMessageKey,
  keyForEnglish,
  resolveLocale,
  t,
  tp,
  translate,
  translatePlural,
  useI18nStore,
  useT,
} from ".";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

afterEach(() => {
  act(() => useI18nStore.getState().setLanguage("system"));
});

describe("locale catalogs", () => {
  it("ship the same keys with the same placeholders in both languages", () => {
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(en).sort());
    for (const [key, english] of Object.entries(en)) {
      expect(placeholders(zhCN[key as keyof typeof zhCN]), key).toEqual(
        placeholders(english),
      );
    }
  });

  it("translate every migration-registry note", () => {
    for (const migration of MIGRATIONS) {
      for (const change of migration.changes) {
        expect(
          keyForEnglish(MIGRATION_NOTE_PREFIX, change.note),
          change.note,
        ).toBeDefined();
      }
    }
  });
});

describe("resolveLocale", () => {
  it("returns a pinned locale as-is", () => {
    expect(resolveLocale("zh-CN", ["en-US"])).toBe("zh-CN");
    expect(resolveLocale("en", ["zh-CN"])).toBe("en");
  });

  it("follows the first supported macOS language", () => {
    expect(resolveLocale("system", ["zh-Hans-CN", "en-US"])).toBe("zh-CN");
    expect(resolveLocale("system", ["fr-FR", "en-GB", "zh-CN"])).toBe("en");
    expect(resolveLocale("system", ["fr-FR", "zh-TW"])).toBe("zh-CN");
  });

  it("falls back to English for unsupported languages", () => {
    expect(resolveLocale("system", ["fr-FR", "de-DE"])).toBe("en");
    expect(resolveLocale("system", [])).toBe("en");
  });

  it("reads navigator languages by default", () => {
    expect(resolveLocale("system")).toBe("en"); // jsdom reports en-US
  });
});

describe("translate", () => {
  it("fills placeholders and leaves unknown ones intact", () => {
    expect(translate("en", "settings.backupSaved", { path: "/tmp/a" })).toBe(
      "Backup saved to /tmp/a",
    );
    expect(translate("zh-CN", "settings.backupSaved")).toBe(
      "备份已保存到 {path}",
    );
    expect(translate("en", "settings.backupSaved", { other: "x" })).toBe(
      "Backup saved to {path}",
    );
  });

  it("falls back to the key for an unknown message", () => {
    expect(translate("zh-CN", "no.such.key" as never)).toBe("no.such.key");
  });

  it("picks English plural forms and the single Chinese form", () => {
    expect(translatePlural("en", "events.dayCount", 1)).toBe("1 day");
    expect(translatePlural("en", "events.dayCount", 3)).toBe("3 days");
    expect(translatePlural("zh-CN", "events.dayCount", 1)).toBe("1 天");
  });
});

describe("guards", () => {
  it("recognizes language settings and message keys", () => {
    expect(isLanguageSetting("system")).toBe(true);
    expect(isLanguageSetting("zh-CN")).toBe(true);
    expect(isLanguageSetting("fr")).toBe(false);
    expect(isLanguageSetting(undefined)).toBe(false);
    expect(isMessageKey("common.cancel")).toBe(true);
    expect(isMessageKey("Esc")).toBe(false);
  });

  it("finds a key by its English source text under a prefix", () => {
    expect(keyForEnglish("common.", "Cancel")).toBe("common.cancel");
    expect(keyForEnglish("settings.", "Cancel")).toBeUndefined();
  });
});

describe("active locale", () => {
  it("drives the global helpers", () => {
    act(() => useI18nStore.getState().setLanguage("zh-CN"));
    expect(currentLocale()).toBe("zh-CN");
    expect(t("common.cancel")).toBe("取消");
    expect(tp("events.dayCount", 2)).toBe("2 天");
  });

  it("re-renders hook users when the language changes", () => {
    const { result } = renderHook(() => useT());
    expect(result.current.t("common.save")).toBe("Save");
    expect(result.current.tp("events.dayCount", 2)).toBe("2 days");

    act(() => useI18nStore.getState().setLanguage("zh-CN"));

    expect(result.current.locale).toBe("zh-CN");
    expect(result.current.t("common.save")).toBe("保存");
  });
});
