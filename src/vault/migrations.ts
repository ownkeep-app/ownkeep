import { MODULES } from "@/modules/registry";
import {
  DEFAULT_SUBSCRIPTION_LEAD_DAYS,
  SUBSCRIPTION_CYCLES,
  type SubscriptionCycle,
} from "@/modules/subscriptions/types";
import {
  DEFAULT_TODO_LEAD_MINUTES,
  TODO_PRIORITIES,
  TODO_RECURRENCES,
  type TodoPriority,
  type TodoRecurrence,
} from "@/modules/todos/types";
import {
  APP_VERSION,
  defaultSettings,
  ensureModuleDefaults,
  SCHEMA_VERSION,
  type ModuleDefaults,
  type VaultModel,
} from "./model";
import {
  DEFAULT_CATEGORY,
  defaultCategoryOptions,
  defaultTagOptions,
} from "./taxonomy";

export const OLD_APP_MESSAGE =
  "You are using an older version of keystash. Please upgrade keystash to open this vault.";

export type VersionComparison = -1 | 0 | 1;
export type ChangeKind = "added" | "renamed" | "removed" | "transformed";

export interface AppVersion {
  main: number;
  minor: number;
}

export interface SchemaChange {
  kind: ChangeKind;
  path: string;
  newPath?: string;
  note: string;
  dataLoss?: boolean;
}

export interface Migration {
  from: number;
  to: number;
  summary: string;
  changes: SchemaChange[];
  apply: (model: VaultModel) => VaultModel;
}

export interface MigrationPlan {
  fromSchemaVersion: number;
  toSchemaVersion: number;
  fromAppVersion: string;
  toAppVersion: string;
  steps: Migration[];
  changes: SchemaChange[];
  migratedModel: VaultModel;
}

export class VaultCompatibilityError extends Error {
  constructor(message = OLD_APP_MESSAGE) {
    super(message);
    this.name = "VaultCompatibilityError";
  }
}

const schemaOneToTwo: Migration = {
  from: 1,
  to: 2,
  summary:
    "Add the registry-backed app shell, Dashboard settings, and module slices.",
  changes: [
    {
      kind: "added",
      path: "settings.dashboardHotkey",
      note: "Adds the configurable Dashboard hotkey with the default Cmd+Shift+D.",
    },
    {
      kind: "added",
      path: "settings.modules",
      note: "Adds per-module enable settings so registered modules can appear in the Dashboard.",
    },
    {
      kind: "added",
      path: "modules.*",
      note: "Adds empty data slices for registered modules; existing data is preserved.",
    },
  ],
  apply: (model) => {
    const defaults = defaultSettings();
    return {
      ...model,
      meta: { ...model.meta, schemaVersion: 2 },
      settings: {
        ...defaults,
        ...model.settings,
        dashboardHotkey:
          model.settings.dashboardHotkey || defaults.dashboardHotkey,
        modules: { ...model.settings.modules },
      },
      frecency: model.frecency ?? {},
      modules: model.modules ?? {},
    };
  },
};

const passwordFields = [
  "id",
  "name",
  "username",
  "password",
  "loginUrl",
  "recoveryUrl",
  "notes",
  "tags",
  "updatedAt",
] as const;

const schemaTwoToThree: Migration = {
  from: 2,
  to: 3,
  summary: "Add the real password vault entry shape.",
  changes: passwordFields.map((field): SchemaChange => ({
    kind: "added",
    path: `modules.passwords[].${field}`,
    note: "Adds the password vault fields used by the Dashboard list, detail, edit, and copy flows.",
  })),
  apply: (model) => {
    const passwords = Array.isArray(model.modules.passwords)
      ? model.modules.passwords.map((item, index) =>
          normalizePasswordMigrationItem(item, model.meta.updatedAt, index),
        )
      : [];
    return {
      ...model,
      meta: { ...model.meta, schemaVersion: 3 },
      modules: { ...model.modules, passwords },
    };
  },
};

const todoFields = [
  "id",
  "title",
  "notes",
  "done",
  "dueAt",
  "notifyLeadMinutes",
  "priority",
  "tags",
  "recurrence",
  "updatedAt",
] as const;

const schemaThreeToFour: Migration = {
  from: 3,
  to: 4,
  summary: "Add the real todos checklist entry shape.",
  changes: todoFields.map((field): SchemaChange => ({
    kind: "added",
    path: `modules.todos[].${field}`,
    note: "Adds the todo fields used by the checklist, recurrence, command-bar toggle, and reminder scheduler.",
  })),
  apply: (model) => {
    const todos = Array.isArray(model.modules.todos)
      ? model.modules.todos.map((item, index) =>
          normalizeTodoMigrationItem(item, model.meta.updatedAt, index),
        )
      : [];
    return {
      ...model,
      meta: { ...model.meta, schemaVersion: 4 },
      modules: { ...model.modules, todos },
    };
  },
};

const subscriptionFields = [
  "id",
  "service",
  "url",
  "amount",
  "currency",
  "cycle",
  "customIntervalDays",
  "nextDueDate",
  "autoRenew",
  "notifyLeadDays",
  "notes",
  "updatedAt",
] as const;

const schemaFourToFive: Migration = {
  from: 4,
  to: 5,
  summary: "Add the real subscriptions renewal entry shape.",
  changes: subscriptionFields.map((field): SchemaChange => ({
    kind: "added",
    path: `modules.subscriptions[].${field}`,
    note: "Adds the subscription fields used by billing summaries, due reminders, command-bar URL copy, and renewal tracking.",
  })),
  apply: (model) => {
    const subscriptions = Array.isArray(model.modules.subscriptions)
      ? model.modules.subscriptions.map((item, index) =>
          normalizeSubscriptionMigrationItem(item, model.meta.updatedAt, index),
        )
      : [];
    return {
      ...model,
      meta: { ...model.meta, schemaVersion: 5 },
      modules: { ...model.modules, subscriptions },
    };
  },
};

const schemaFiveToSix: Migration = {
  from: 5,
  to: 6,
  summary:
    "Add configurable category/tag option lists and item category fields across modules.",
  changes: [
    {
      kind: "added",
      path: "settings.categoryOptions",
      note: "Adds the configurable category labels used by item edit forms.",
    },
    {
      kind: "added",
      path: "settings.tagOptions",
      note: "Adds the configurable tag labels used by item edit forms.",
    },
    {
      kind: "added",
      path: "modules.passwords[].category",
      note: "Adds the single-select category field for password entries.",
    },
    {
      kind: "added",
      path: "modules.todos[].category",
      note: "Adds the single-select category field for todo entries.",
    },
    {
      kind: "added",
      path: "modules.subscriptions[].category",
      note: "Adds the single-select category field for subscription entries.",
    },
    {
      kind: "added",
      path: "modules.subscriptions[].tags",
      note: "Adds the multi-select tags field for subscription entries.",
    },
  ],
  apply: (model) => {
    const passwords = Array.isArray(model.modules.passwords)
      ? model.modules.passwords.map((item, index) => {
          const normalized = normalizePasswordMigrationItem(
            item,
            model.meta.updatedAt,
            index,
          );
          const category =
            typeof normalized.category === "string" &&
            normalized.category.trim()
              ? normalized.category.trim()
              : DEFAULT_CATEGORY;
          return { ...normalized, category };
        })
      : [];
    const todos = Array.isArray(model.modules.todos)
      ? model.modules.todos.map((item, index) => {
          const normalized = normalizeTodoMigrationItem(
            item,
            model.meta.updatedAt,
            index,
          );
          const category =
            typeof normalized.category === "string" &&
            normalized.category.trim()
              ? normalized.category.trim()
              : DEFAULT_CATEGORY;
          return { ...normalized, category };
        })
      : [];
    const subscriptions = Array.isArray(model.modules.subscriptions)
      ? model.modules.subscriptions.map((item, index) => {
          const normalized = normalizeSubscriptionMigrationItem(
            item,
            model.meta.updatedAt,
            index,
          );
          const category =
            typeof normalized.category === "string" &&
            normalized.category.trim()
              ? normalized.category.trim()
              : DEFAULT_CATEGORY;
          const tags = Array.isArray(normalized.tags)
            ? normalized.tags.filter(
                (tag): tag is string => typeof tag === "string",
              )
            : [];
          return { ...normalized, category, tags };
        })
      : [];
    return {
      ...model,
      meta: { ...model.meta, schemaVersion: 6 },
      settings: {
        ...model.settings,
        categoryOptions: model.settings.categoryOptions?.length
          ? model.settings.categoryOptions
          : defaultCategoryOptions(),
        tagOptions: model.settings.tagOptions?.length
          ? model.settings.tagOptions
          : defaultTagOptions(),
      },
      modules: {
        ...model.modules,
        passwords,
        todos,
        subscriptions,
      },
    };
  },
};

const schemaSixToSeven: Migration = {
  from: 6,
  to: 7,
  summary: "Remove the unused tags field from todo entries.",
  changes: [
    {
      kind: "removed",
      path: "modules.todos[].tags",
      note: "Todos use category only; per-item tags are dropped.",
      dataLoss: true,
    },
  ],
  apply: (model) => {
    const todos = Array.isArray(model.modules.todos)
      ? model.modules.todos.map((item, index) => {
          const normalized = normalizeTodoMigrationItem(
            item,
            model.meta.updatedAt,
            index,
          );
          const { tags: _tags, ...withoutTags } = normalized;
          return withoutTags;
        })
      : [];
    return {
      ...model,
      meta: { ...model.meta, schemaVersion: 7 },
      modules: { ...model.modules, todos },
    };
  },
};

const schemaSevenToEight: Migration = {
  from: 7,
  to: 8,
  summary: "Replace password tags with category-only.",
  changes: [
    {
      kind: "removed",
      path: "modules.passwords[].tags",
      note: "Passwords use category only; per-item tags are dropped.",
      dataLoss: true,
    },
  ],
  apply: (model) => {
    const passwords = Array.isArray(model.modules.passwords)
      ? model.modules.passwords.map((item, index) => {
          const normalized = normalizePasswordMigrationItem(
            item,
            model.meta.updatedAt,
            index,
          );
          const { tags: _tags, ...withoutTags } = normalized;
          return withoutTags;
        })
      : [];
    return {
      ...model,
      meta: { ...model.meta, schemaVersion: 8 },
      modules: { ...model.modules, passwords },
    };
  },
};

/** Modules that default to command-bar search when `searchable` is first introduced. */
const DEFAULT_SEARCHABLE_MODULE_IDS = new Set(["passwords", "commands"]);

const schemaEightToNine: Migration = {
  from: 8,
  to: 9,
  summary: "Add per-module searchable flag for the command bar.",
  changes: [
    {
      kind: "added",
      path: "settings.modules.*.searchable",
      note: "Defaults true for passwords and commands; false for other modules.",
    },
  ],
  apply: (model) => {
    const modules = Object.fromEntries(
      Object.entries(model.settings.modules).map(([id, settings]) => [
        id,
        {
          ...settings,
          searchable:
            typeof settings.searchable === "boolean"
              ? settings.searchable
              : DEFAULT_SEARCHABLE_MODULE_IDS.has(id),
        },
      ]),
    );
    return {
      ...model,
      meta: { ...model.meta, schemaVersion: 9 },
      settings: { ...model.settings, modules },
    };
  },
};

export const MIGRATIONS: Migration[] = [
  schemaOneToTwo,
  schemaTwoToThree,
  schemaThreeToFour,
  schemaFourToFive,
  schemaFiveToSix,
  schemaSixToSeven,
  schemaSevenToEight,
  schemaEightToNine,
];

function normalizePasswordMigrationItem(
  item: unknown,
  updatedAt: string,
  index: number,
): Record<string, unknown> {
  const object =
    item && typeof item === "object" && !Array.isArray(item)
      ? (item as Record<string, unknown>)
      : {};
  return {
    id:
      typeof object.id === "string"
        ? object.id
        : `legacy-password-${index + 1}`,
    name: typeof object.name === "string" ? object.name : "",
    username: typeof object.username === "string" ? object.username : "",
    password: typeof object.password === "string" ? object.password : "",
    loginUrl: typeof object.loginUrl === "string" ? object.loginUrl : "",
    recoveryUrl:
      typeof object.recoveryUrl === "string" ? object.recoveryUrl : "",
    notes: typeof object.notes === "string" ? object.notes : "",
    category:
      typeof object.category === "string" ? object.category : DEFAULT_CATEGORY,
    tags: Array.isArray(object.tags)
      ? object.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    updatedAt:
      typeof object.updatedAt === "string" ? object.updatedAt : updatedAt,
  };
}

function normalizeTodoMigrationItem(
  item: unknown,
  updatedAt: string,
  index: number,
): Record<string, unknown> {
  const object =
    item && typeof item === "object" && !Array.isArray(item)
      ? (item as Record<string, unknown>)
      : {};
  return {
    id: typeof object.id === "string" ? object.id : `legacy-todo-${index + 1}`,
    title: typeof object.title === "string" ? object.title : "",
    notes: typeof object.notes === "string" ? object.notes : "",
    done: typeof object.done === "boolean" ? object.done : false,
    dueAt: typeof object.dueAt === "string" ? object.dueAt : null,
    notifyLeadMinutes:
      typeof object.notifyLeadMinutes === "number" &&
      Number.isFinite(object.notifyLeadMinutes) &&
      object.notifyLeadMinutes >= 0
        ? object.notifyLeadMinutes
        : DEFAULT_TODO_LEAD_MINUTES,
    priority: TODO_PRIORITIES.includes(object.priority as TodoPriority)
      ? object.priority
      : "normal",
    category:
      typeof object.category === "string" ? object.category : DEFAULT_CATEGORY,
    tags: Array.isArray(object.tags)
      ? object.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    recurrence: TODO_RECURRENCES.includes(object.recurrence as TodoRecurrence)
      ? object.recurrence
      : "none",
    updatedAt:
      typeof object.updatedAt === "string" ? object.updatedAt : updatedAt,
  };
}

function normalizeSubscriptionMigrationItem(
  item: unknown,
  updatedAt: string,
  index: number,
): Record<string, unknown> {
  const object =
    item && typeof item === "object" && !Array.isArray(item)
      ? (item as Record<string, unknown>)
      : {};
  const cycle = SUBSCRIPTION_CYCLES.includes(object.cycle as SubscriptionCycle)
    ? object.cycle
    : "monthly";
  const customIntervalDays =
    typeof object.customIntervalDays === "number" &&
    Number.isInteger(object.customIntervalDays) &&
    object.customIntervalDays > 0
      ? object.customIntervalDays
      : null;
  const amount =
    typeof object.amount === "number" &&
    Number.isFinite(object.amount) &&
    object.amount >= 0
      ? object.amount
      : 0;
  return {
    id:
      typeof object.id === "string"
        ? object.id
        : `legacy-subscription-${index + 1}`,
    service: typeof object.service === "string" ? object.service : "",
    url: typeof object.url === "string" ? object.url : "",
    amount,
    currency:
      typeof object.currency === "string" && object.currency.trim()
        ? object.currency.trim().toUpperCase()
        : "CNY",
    cycle,
    customIntervalDays: cycle === "custom" ? customIntervalDays : null,
    nextDueDate:
      typeof object.nextDueDate === "string" ? object.nextDueDate : updatedAt,
    autoRenew: typeof object.autoRenew === "boolean" ? object.autoRenew : true,
    notifyLeadDays:
      typeof object.notifyLeadDays === "number" &&
      Number.isInteger(object.notifyLeadDays) &&
      object.notifyLeadDays >= 0
        ? object.notifyLeadDays
        : DEFAULT_SUBSCRIPTION_LEAD_DAYS,
    notes: typeof object.notes === "string" ? object.notes : "",
    category:
      typeof object.category === "string" ? object.category : DEFAULT_CATEGORY,
    tags: Array.isArray(object.tags)
      ? object.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    updatedAt:
      typeof object.updatedAt === "string" ? object.updatedAt : updatedAt,
  };
}

export function parseAppVersion(version: string): AppVersion {
  const match = /^(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Invalid app version "${version}". Expected main.minor.`);
  }
  return { main: Number(match[1]), minor: Number(match[2]) };
}

export function compareAppVersions(a: string, b: string): VersionComparison {
  const left = parseAppVersion(a);
  const right = parseAppVersion(b);
  if (left.main !== right.main) {
    return left.main > right.main ? 1 : -1;
  }
  if (left.minor !== right.minor) {
    return left.minor > right.minor ? 1 : -1;
  }
  return 0;
}

export function assertVaultIsReadable(model: VaultModel): void {
  if (compareAppVersions(model.meta.appVersion, APP_VERSION) > 0) {
    throw new VaultCompatibilityError();
  }
  if (model.meta.schemaVersion > SCHEMA_VERSION) {
    throw new VaultCompatibilityError();
  }
}

export function pendingMigrations(fromSchemaVersion: number): Migration[] {
  const steps: Migration[] = [];
  let current = fromSchemaVersion;

  while (current < SCHEMA_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === current);
    if (!step) {
      throw new Error(
        `No migration path from schema ${current} to ${SCHEMA_VERSION}.`,
      );
    }
    steps.push(step);
    current = step.to;
  }

  return steps;
}

export function buildMigrationPlan(
  model: VaultModel,
  modules: ModuleDefaults[] = MODULES,
): MigrationPlan | null {
  assertVaultIsReadable(model);

  const steps = pendingMigrations(model.meta.schemaVersion);
  if (steps.length === 0) {
    return null;
  }

  const migrated = steps.reduce((next, step) => step.apply(next), model);
  const migratedModel = ensureModuleDefaults(
    {
      ...migrated,
      meta: {
        ...migrated.meta,
        schemaVersion: SCHEMA_VERSION,
        appVersion: APP_VERSION,
      },
    },
    modules,
  );

  return {
    fromSchemaVersion: model.meta.schemaVersion,
    toSchemaVersion: SCHEMA_VERSION,
    fromAppVersion: model.meta.appVersion,
    toAppVersion: APP_VERSION,
    steps,
    changes: steps.flatMap((step) => step.changes),
    migratedModel,
  };
}

export function prepareVaultModel(
  model: VaultModel,
  modules: ModuleDefaults[] = MODULES,
): { model: VaultModel; migration: MigrationPlan | null } {
  const migration = buildMigrationPlan(model, modules);
  if (migration) {
    return { model: migration.migratedModel, migration };
  }

  assertVaultIsReadable(model);
  return { model: ensureModuleDefaults(model, modules), migration: null };
}

export function preMigrationBackupName(
  oldAppVersion: string,
  newAppVersion = APP_VERSION,
  date = new Date(),
): string {
  return `keystash-pre-migration-v${oldAppVersion}-to-v${newAppVersion}-${backupTimestamp(date)}.dat`;
}

export function preRestoreBackupName(date = new Date()): string {
  return `keystash-pre-restore-${backupTimestamp(date)}.dat`;
}

export function vaultBackupName(appVersion: string, date = new Date()): string {
  return `keystash-v${appVersion}-${backupTimestamp(date)}.dat`;
}

function backupTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join("");
}
