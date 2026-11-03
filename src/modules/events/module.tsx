import { CalendarRange } from "lucide-react";

import type { FeatureModule } from "@/modules/types";
import { EventDetailView, EventEditView, EventsListView } from "./EventsModule";
import { buildEventIndex, isTrackedEvent, trackedEvents } from "./logic";
import { EVENTS_MODULE_ID } from "./types";

export const eventsModule: FeatureModule = {
  id: EVENTS_MODULE_ID,
  titleKey: "module.events",
  icon: <CalendarRange className="h-4 w-4" />,
  enabledByDefault: true,
  searchableByDefault: false,
  scopePrefix: "e",
  createEmpty: () => [],
  buildIndex: (items) => buildEventIndex(trackedEvents(items)),
  ListView: ({ items, focusItemId, onFocusItemHandled }) => (
    <EventsListView
      focusItemId={focusItemId}
      items={trackedEvents(items)}
      onFocusItemHandled={onFocusItemHandled}
    />
  ),
  DetailView: ({ item }) =>
    isTrackedEvent(item) ? <EventDetailView item={item} /> : null,
  EditView: ({ item, onSave, onCancel }) => (
    <EventEditView
      item={isTrackedEvent(item) ? item : undefined}
      onCancel={onCancel}
      onSave={onSave}
    />
  ),
};
