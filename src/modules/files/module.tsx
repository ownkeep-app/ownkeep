import { Files } from "lucide-react";

import type { FeatureModule } from "@/modules/types";
import { FilesListView } from "./FilesModule";
import { FilesSettingsPanel } from "./FilesSettingsPanel";
import { buildFileIndex, fileEntries } from "./logic";
import { FILES_MODULE_ID } from "./types";

export const filesModule: FeatureModule = {
  id: FILES_MODULE_ID,
  titleKey: "module.files",
  icon: <Files className="h-4 w-4" />,
  enabledByDefault: true,
  searchableByDefault: false,
  // "f" is Finance.
  scopePrefix: "fi",
  createEmpty: () => [],
  buildIndex: (items) => buildFileIndex(fileEntries(items)),
  ListView: ({ items, focusItemId, onFocusItemHandled }) => (
    <FilesListView
      focusItemId={focusItemId}
      items={fileEntries(items)}
      onFocusItemHandled={onFocusItemHandled}
    />
  ),
  SettingsPanel: FilesSettingsPanel,
};
