/**
 * The module registry (spec §3.4) — the one file you edit to add/remove a feature.
 *
 * Phase 2 ships lightweight *stubs*: enough (id, title, icon, scope, defaults, an empty index, and a
 * placeholder `ListView`) to drive the registry-powered shell — sidebar, panes, settings toggles.
 * Each real module replaces its stub in the module's own phase (passwords → Phase 3, and so on).
 */

import { CreditCard, Key, ListTodo, Terminal, TrendingUp } from "lucide-react";

import { ComingSoon } from "./ComingSoon";
import type { FeatureModule } from "./types";

const passwordsModule: FeatureModule = {
  id: "passwords",
  title: "Passwords",
  icon: <Key className="h-4 w-4" />,
  enabledByDefault: true,
  scopePrefix: "p",
  secretFields: ["password"],
  createEmpty: () => [],
  buildIndex: () => [],
  ListView: () => <ComingSoon title="Passwords" phase="Phase 3" />,
};

const commandsModule: FeatureModule = {
  id: "commands",
  title: "Commands",
  icon: <Terminal className="h-4 w-4" />,
  enabledByDefault: true,
  scopePrefix: "c",
  createEmpty: () => [],
  buildIndex: () => [],
  ListView: () => <ComingSoon title="Command library" phase="Phase 5" />,
};

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
