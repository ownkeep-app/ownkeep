import { StickyNote } from "lucide-react";

import type { FeatureModule } from "@/modules/types";
import { NoteDetailView, NoteEditView, NotesListView } from "./NotesModule";
import { buildNoteIndex, isNoteEntry, noteEntries } from "./logic";
import { NOTES_MODULE_ID } from "./types";

export const notesModule: FeatureModule = {
  id: NOTES_MODULE_ID,
  title: "Notes",
  icon: <StickyNote className="h-4 w-4" />,
  enabledByDefault: true,
  searchableByDefault: false,
  scopePrefix: "n",
  createEmpty: () => [],
  buildIndex: (items) => buildNoteIndex(noteEntries(items)),
  ListView: ({ items, focusItemId, onFocusItemHandled }) => (
    <NotesListView
      focusItemId={focusItemId}
      items={noteEntries(items)}
      onFocusItemHandled={onFocusItemHandled}
    />
  ),
  DetailView: ({ item }) =>
    isNoteEntry(item) ? <NoteDetailView item={item} /> : null,
  EditView: ({ item, onSave, onCancel }) => (
    <NoteEditView
      item={isNoteEntry(item) ? item : undefined}
      onCancel={onCancel}
      onSave={onSave}
    />
  ),
};
