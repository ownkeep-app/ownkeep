import { Terminal } from "lucide-react";

import type { FeatureModule } from "@/modules/types";
import {
  CommandDetailView,
  CommandEditView,
  CommandsListView,
} from "./CommandsModule";
import { buildCommandIndex, commandEntries, isCommandEntry } from "./logic";
import { COMMANDS_MODULE_ID } from "./types";

export const commandsModule: FeatureModule = {
  id: COMMANDS_MODULE_ID,
  title: "Commands",
  icon: <Terminal className="h-4 w-4" />,
  enabledByDefault: true,
  searchableByDefault: true,
  scopePrefix: "c",
  createEmpty: () => [],
  buildIndex: (items) => buildCommandIndex(commandEntries(items)),
  ListView: ({ items }) => <CommandsListView items={commandEntries(items)} />,
  DetailView: ({ item }) =>
    isCommandEntry(item) ? <CommandDetailView item={item} /> : null,
  EditView: ({ item, onSave, onCancel }) => (
    <CommandEditView
      item={isCommandEntry(item) ? item : undefined}
      onCancel={onCancel}
      onSave={onSave}
    />
  ),
};
