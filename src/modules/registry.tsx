/**
 * The module registry (spec §3.4) — the one file you edit to add/remove a feature.
 *
 * Modules start as lightweight stubs, then graduate in their plan phase. Passwords is the first
 * real module (Phase 3); later modules keep their placeholders until their own phases land.
 */

import { CreditCard, ListTodo, TrendingUp } from "lucide-react";

import { ComingSoon } from "./ComingSoon";
import { commandsModule } from "./commands/module";
import { passwordsModule } from "./passwords/module";
import type { FeatureModule } from "./types";

const todosModule: FeatureModule = {
  id: "todos",
  title: "Todos",
  icon: <ListTodo className="h-4 w-4" />,
  enabledByDefault: true,
  scopePrefix: "t",
  createEmpty: () => [],
  buildIndex: () => [],
  ListView: () => <ComingSoon title="Todos" phase="Phase 8" />,
};

const subscriptionsModule: FeatureModule = {
  id: "subscriptions",
  title: "Subscriptions",
  icon: <CreditCard className="h-4 w-4" />,
  enabledByDefault: true,
  scopePrefix: "s",
  createEmpty: () => [],
  buildIndex: () => [],
  ListView: () => <ComingSoon title="Subscriptions" phase="Phase 9" />,
};

const financeModule: FeatureModule = {
  id: "finance",
  title: "Finance",
  icon: <TrendingUp className="h-4 w-4" />,
  enabledByDefault: true,
  scopePrefix: "f",
  createEmpty: () => ({ snapshots: [] }),
  buildIndex: () => [],
  ListView: () => <ComingSoon title="Finance" phase="Phase 10" />,
};

/** The registered modules, in display order. */
export const MODULES: FeatureModule[] = [
  passwordsModule,
  commandsModule,
  todosModule,
  subscriptionsModule,
  financeModule,
];
