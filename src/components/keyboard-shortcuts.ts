export interface Shortcut {
  keys: string[];
  label: string;
}

export interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

/** Keyboard maps surfaced by the in-app cheat sheet (spec §10). */
export const COMMAND_BAR_SHORTCUTS: ShortcutGroup = {
  title: "Command bar",
  shortcuts: [
    { keys: ["Type"], label: "Search across searchable modules" },
    { keys: ["⌥", "⇧", "1–9"], label: "Run a result's primary action" },
    { keys: ["⌥", "⌘", "1–9"], label: "Copy a command's raw template" },
    { keys: ["↵"], label: "Run the selected result" },
    { keys: ["Esc"], label: "Hide the launcher" },
  ],
};

export const DASHBOARD_SHORTCUTS: ShortcutGroup = {
  title: "Dashboard",
  shortcuts: [
    { keys: ["⌥", "⇧", "1–9"], label: "Jump to the Nth module" },
    { keys: ["↑", "↓"], label: "Move through the sidebar" },
  ],
};

export const GLOBAL_SHORTCUTS: ShortcutGroup = {
  title: "Anywhere",
  shortcuts: [
    { keys: ["⌘", "⇧", "Space"], label: "Summon the command bar" },
    { keys: ["⌘", "⇧", "D"], label: "Toggle the Dashboard window" },
    { keys: ["⌘", "H"], label: "Show this shortcut help" },
    { keys: ["⌘", "/"], label: "About keystash" },
  ],
};
