/**
 * The unified command-bar index and ranking (spec §7.2).
 *
 * Pure functions: modules contribute entries via `buildIndex`, results are ranked by Fuse.js fuzzy
 * score combined with a frecency boost. Empty until modules land, but fully tested so it's ready.
 */

import Fuse from "fuse.js";

import type { FeatureModule, IndexEntry } from "@/modules/types";
import type { FrecencyEntry, VaultModel } from "@/vault/model";

/** Flatten every *enabled* module's search entries into one index. */
export function buildUnifiedIndex(
  model: VaultModel,
  modules: FeatureModule[],
): IndexEntry[] {
  const entries: IndexEntry[] = [];
  for (const m of modules) {
    if (model.settings.modules[m.id]?.enabled) {
      const slice = model.modules[m.id];
      const items = Array.isArray(slice) ? slice : [];
      entries.push(...m.buildIndex(items));
    }
  }
  return entries;
}

export interface Scope {
  /** The module to restrict to, or null for a global search. */
  moduleId: string | null;
  /** The query with any scope prefix stripped. */
  term: string;
}

/** Parse a leading scope prefix like `p github` → { passwords, "github" } (§7.2). */
export function parseScope(query: string, modules: FeatureModule[]): Scope {
  const space = query.indexOf(" ");
  if (space > 0) {
    const prefix = query.slice(0, space);
    const mod = modules.find((m) => m.scopePrefix === prefix);
    if (mod) {
      return { moduleId: mod.id, term: query.slice(space + 1).trim() };
    }
  }
  return { moduleId: null, term: query.trim() };
}

/**
 * A ranking multiplier from an item's usage history: more frequent and more recent → higher.
 * Habitual items float to the top, mirroring Raycast/Alfred frecency.
 */
export function frecencyBoost(
  entry: FrecencyEntry | undefined,
  now: number,
): number {
  if (!entry) return 1;
  const ageDays = Math.max(
    0,
    (now - Date.parse(entry.lastUsedAt)) / 86_400_000,
  );
  const recency = 1 / (1 + ageDays);
  return 1 + Math.log2(1 + entry.count) * (0.5 + recency);
}

export interface RankedResult {
  entry: IndexEntry;
  score: number;
}

/** Rank entries for `query`: Fuse fuzzy score × frecency boost, capped at `limit` (§7.2). */
export function search(
  query: string,
  entries: IndexEntry[],
  frecency: Record<string, FrecencyEntry>,
  limit: number,
  now: number = Date.now(),
): RankedResult[] {
  if (!query.trim()) {
    // No query: rank purely by frecency so habitual items lead.
    return entries
      .map((entry) => ({
        entry,
        score: frecencyBoost(frecency[entry.id], now),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
  const fuse = new Fuse(entries, {
    keys: ["searchString"],
    includeScore: true,
    threshold: 0.4,
  });
  return fuse
    .search(query)
    .map((r) => ({
      entry: r.item,
      // Fuse score is 0 (perfect) → 1 (worst); invert, then weight by frecency.
      score: (1 - (r.score ?? 1)) * frecencyBoost(frecency[r.item.id], now),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
