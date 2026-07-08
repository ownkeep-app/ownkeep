/**
 * The module registry (spec §3.4) — the one file you edit to add/remove a feature.
 *
 * Every listed module is fully implemented; adding a new feature means writing one `FeatureModule`
 * and appending it here (no core changes).
 */

import { commandsModule } from "./commands/module";
import { financeModule } from "./finance/module";
import { passwordsModule } from "./passwords/module";
import { subscriptionsModule } from "./subscriptions/module";
import { todosModule } from "./todos/module";
import type { FeatureModule } from "./types";

/** The registered modules, in display order. */
export const MODULES: FeatureModule[] = [
  passwordsModule,
  commandsModule,
  todosModule,
  subscriptionsModule,
  financeModule,
];
