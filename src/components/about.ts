import { APP_VERSION } from "@/vault/model";

/** Product About metadata (Dashboard sidebar + ⌘/ dialog). */
export const APP_WEBSITE = "https://ownkeep.app";
export const APP_DEVELOPER_EMAIL = "caishaojiang@gmail.com";

/** Human-readable release date for the current `package.json` version. Update on each ship. */
export const APP_RELEASE_DATE = "July 15, 2026";

export const APP_FEATURES = [
  "Offline-first password vault with a master password and Emergency Kit recovery code",
  "Spotlight-style command bar for fast search and copy",
  "Command-line snippet library with fill-in placeholders",
  "Dashboard to browse and manage passwords, commands, todos, subscriptions, and finance",
  // "Optional Touch ID unlock on supported Macs", // Settings UI deferred until after v1.0
  "Encrypted single-file vault with backup and restore",
] as const;

export function aboutVersionLabel(version = APP_VERSION): string {
  return `OwnKeep v${version}`;
}
