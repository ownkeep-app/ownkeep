import type { MessageKey } from "@/i18n";

export interface Shortcut {
  /** Key glyphs, or a message key for a key named in words (e.g. "Type"). */
  keys: (string | MessageKey)[];
  labelKey: MessageKey;
}

export interface ShortcutGroup {
  titleKey: MessageKey;
  shortcuts: Shortcut[];
}

/** Keyboard maps surfaced by the in-app cheat sheet (spec §10). */
export const COMMAND_BAR_SHORTCUTS: ShortcutGroup = {
  titleKey: "shortcuts.commandBar",
  shortcuts: [
    { keys: ["shortcuts.key.type"], labelKey: "shortcuts.search" },
    { keys: ["⌥", "⇧", "1–9"], labelKey: "shortcuts.runPrimary" },
    { keys: ["⌥", "⌘", "1–9"], labelKey: "shortcuts.copyRaw" },
    { keys: ["↵"], labelKey: "shortcuts.runSelected" },
    { keys: ["Esc"], labelKey: "shortcuts.hideLauncher" },
  ],
};

export const DASHBOARD_SHORTCUTS: ShortcutGroup = {
  titleKey: "shortcuts.dashboard",
  shortcuts: [
    { keys: ["⌥", "⇧", "1–9"], labelKey: "shortcuts.jumpToModule" },
    { keys: ["↑", "↓"], labelKey: "shortcuts.moveSidebar" },
  ],
};

export const GLOBAL_SHORTCUTS: ShortcutGroup = {
  titleKey: "shortcuts.anywhere",
  shortcuts: [
    { keys: ["⌘", "⇧", "Space"], labelKey: "shortcuts.summonBar" },
    { keys: ["⌘", "⇧", "D"], labelKey: "shortcuts.toggleDashboard" },
    { keys: ["⌘", "H"], labelKey: "shortcuts.showHelp" },
    { keys: ["⌘", "/"], labelKey: "shortcuts.about" },
  ],
};
