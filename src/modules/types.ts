/**
 * The feature-module contract (spec §3.4).
 *
 * The core is module-agnostic: it iterates the registry to build the unified search index, the
 * Dashboard sidebar + content panes, the settings tabs, and the scheduler. Adding a feature means
 * writing one `FeatureModule` and registering it — no core changes.
 *
 * Phase 2 needs `ListView` (for the Dashboard pane) and `buildIndex` (for the command bar). The
 * richer surface (`DetailView` / `EditView` / `SettingsPanel` / `collectReminders`) is optional and
 * filled in per module as each module's phase lands.
 */

import type { FC, ReactNode } from "react";
import type { VaultSettings } from "@/vault/model";

/** One searchable entry a module contributes to the unified command-bar index (§7.2). */
export interface IndexEntry {
  /** Stable item id (also the frecency key). */
  id: string;
  moduleId: string;
  /** Result kind, e.g. "password" | "command" — drives the primary action later. */
  type: string;
  /** Text matched against the query (fuzzy). */
  searchString: string;
  /** One-line label shown in the results list. */
  displayLine: string;
}

export interface ListViewProps<T> {
  items: T[];
}

export interface ReminderEvent {
  /** Stable per-module reminder id, usually the item id plus reminder kind. */
  id: string;
  title: string;
  body?: string;
}

export interface FeatureModule<T = unknown> {
  id: string;
  title: string;
  icon: ReactNode;
  enabledByDefault: boolean;
  /** Command-bar scope prefix, e.g. "p " for passwords (§7.2). */
  scopePrefix?: string;
  /** Fields Rust must redact from the projection + serve only via copy_secret (§4.5). */
  secretFields?: string[];

  /** Initial data slice for a fresh vault (empty until the module lands). */
  createEmpty: () => T[] | Record<string, unknown>;
  /** Build this module's search entries from its slice (empty for stubs). */
  buildIndex: (items: T[]) => IndexEntry[];

  /** The Dashboard right-pane view listing all of this module's content (§7.5). */
  ListView: FC<ListViewProps<T>>;
  DetailView?: FC<{ item: T }>;
  EditView?: FC<{ item?: T; onSave: (item: T) => void; onCancel: () => void }>;
  SettingsPanel?: FC;
  collectReminders?: (
    items: T[],
    now: Date,
    settings: VaultSettings,
  ) => ReminderEvent[];
}
