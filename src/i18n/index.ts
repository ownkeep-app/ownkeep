/**
 * UI translations (spec §9 "Language"). Messages ship as bundled JSON catalogs — one per locale —
 * so the app never fetches or machine-translates anything at runtime. The Rust core embeds the same
 * files for its few native strings (tray menu, quit dialog, reminder notifications).
 *
 * Templates use `{name}` placeholders. Plural forms are `<key>_one` / `<key>_other` pairs picked by
 * `Intl.PluralRules`; Chinese has no plural inflection, so both forms carry the same text there.
 */

import { useMemo } from "react";
import { create } from "zustand";

import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";

export const LOCALES = ["en", "zh-CN"] as const;
export type Locale = (typeof LOCALES)[number];
/** The stored preference: follow macOS, or pin one locale. */
export type LanguageSetting = "system" | Locale;
export const DEFAULT_LANGUAGE: LanguageSetting = "system";

export type MessageKey = keyof typeof en;
export type PluralKey = MessageKey extends infer K
  ? K extends `${infer Base}_other`
    ? Base
    : never
  : never;
export type MessageVars = Record<string, string | number>;

// Typing the Chinese catalog against the English keys makes a missing translation a compile error.
const CATALOGS: Record<Locale, Record<MessageKey, string>> = {
  en,
  "zh-CN": zhCN,
};

const PLACEHOLDER = /\{(\w+)\}/g;

function systemLanguages(): readonly string[] {
  return navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
}

/** Resolve the stored preference to a supported locale; unsupported system languages fall back to English. */
export function resolveLocale(
  language: LanguageSetting,
  preferred: readonly string[] = systemLanguages(),
): Locale {
  if (language !== "system") return language;
  for (const tag of preferred) {
    const lower = tag.toLowerCase();
    if (lower.startsWith("zh")) return "zh-CN";
    if (lower.startsWith("en")) return "en";
  }
  return "en";
}

export function isMessageKey(value: string): value is MessageKey {
  return Object.prototype.hasOwnProperty.call(CATALOGS.en, value);
}

/**
 * gettext-style lookup for text whose English source lives elsewhere (e.g. migration notes in the
 * migration registry): the key under `prefix` whose English value equals `english`, if any.
 */
export function keyForEnglish(
  prefix: string,
  english: string,
): MessageKey | undefined {
  return (Object.keys(CATALOGS.en) as MessageKey[]).find(
    (key) => key.startsWith(prefix) && CATALOGS.en[key] === english,
  );
}

export function isLanguageSetting(value: unknown): value is LanguageSetting {
  return value === "system" || LOCALES.includes(value as Locale);
}

export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: MessageVars,
): string {
  const template = CATALOGS[locale][key] ?? CATALOGS.en[key] ?? key;
  if (!vars) return template;
  return template.replace(PLACEHOLDER, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function translatePlural(
  locale: Locale,
  key: PluralKey,
  count: number,
  vars?: MessageVars,
): string {
  const form =
    new Intl.PluralRules(locale).select(count) === "one" ? "one" : "other";
  return translate(locale, `${key}_${form}` as MessageKey, { count, ...vars });
}

interface I18nState {
  language: LanguageSetting;
  locale: Locale;
  setLanguage: (language: LanguageSetting) => void;
}

/**
 * The active locale. It deliberately outlives a lock: the vault (and its `settings.language`) is gone
 * while locked, so the lock screen keeps the last unlocked choice; a cold start follows macOS.
 */
export const useI18nStore = create<I18nState>((set) => ({
  language: DEFAULT_LANGUAGE,
  locale: resolveLocale(DEFAULT_LANGUAGE),
  setLanguage: (language) => set({ language, locale: resolveLocale(language) }),
}));

export function currentLocale(): Locale {
  return useI18nStore.getState().locale;
}

/** Translate outside React (stores, toasts, pure helpers) — reads the locale at call time. */
export function t(key: MessageKey, vars?: MessageVars): string {
  return translate(currentLocale(), key, vars);
}

export function tp(key: PluralKey, count: number, vars?: MessageVars): string {
  return translatePlural(currentLocale(), key, count, vars);
}

/** Translate inside React; the component re-renders when the locale changes. */
export function useT() {
  const locale = useI18nStore((s) => s.locale);
  return useMemo(
    () => ({
      locale,
      t: (key: MessageKey, vars?: MessageVars) => translate(locale, key, vars),
      tp: (key: PluralKey, count: number, vars?: MessageVars) =>
        translatePlural(locale, key, count, vars),
    }),
    [locale],
  );
}
