import { Key } from "lucide-react";

import type { FeatureModule } from "@/modules/types";
import { buildPasswordIndex, isPasswordEntry, passwordEntries } from "./logic";
import {
  PasswordDetailView,
  PasswordEditView,
  PasswordsListView,
} from "./PasswordsModule";
import { PASSWORD_SECRET_FIELD, PASSWORDS_MODULE_ID } from "./types";

export const passwordsModule: FeatureModule = {
  id: PASSWORDS_MODULE_ID,
  title: "Passwords",
  icon: <Key className="h-4 w-4" />,
  enabledByDefault: true,
  searchableByDefault: true,
  scopePrefix: "p",
  secretFields: [PASSWORD_SECRET_FIELD],
  createEmpty: () => [],
  buildIndex: (items) => buildPasswordIndex(passwordEntries(items)),
  ListView: ({ items }) => <PasswordsListView items={passwordEntries(items)} />,
  DetailView: ({ item }) =>
    isPasswordEntry(item) ? <PasswordDetailView item={item} /> : null,
  EditView: ({ item, onSave, onCancel }) => (
    <PasswordEditView
      item={isPasswordEntry(item) ? item : undefined}
      onCancel={onCancel}
      onSave={onSave}
    />
  ),
};
