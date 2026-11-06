import { type Locale, type MessageKey } from "@/i18n";
import { APP_VERSION } from "@/vault/model";

/** Product About metadata (Dashboard sidebar + ⌘/ dialog). */
export const APP_WEBSITE = "https://ownkeep.app";
export const APP_DEVELOPER_EMAIL = "caishaojiang@gmail.com";
export const APP_LICENSE = "GPL-3.0-or-later";
export const APP_LICENSE_URL =
  "https://github.com/ownkeep-app/ownkeep/blob/main/LICENSE";

/** Release date (`YYYY-MM-DD`) for the current `package.json` version. Update on each ship. */
export const APP_RELEASE_DATE = "2026-09-13";

export const APP_FEATURE_KEYS: MessageKey[] = [
  "about.feature.vault",
  "about.feature.files",
  "about.feature.backup",
  "about.feature.commandBar",
  "about.feature.commands",
  "about.feature.events",
  "about.feature.dashboard",
  "about.feature.notes",
  "about.feature.touchId",
];

export function formatReleaseDate(
  locale: Locale,
  isoDate = APP_RELEASE_DATE,
): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(locale, {
    dateStyle: "long",
  });
}

export function aboutVersionLabel(version = APP_VERSION): string {
  return `OwnKeep v${version}`;
}
