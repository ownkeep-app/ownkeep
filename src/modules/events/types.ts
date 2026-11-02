export const EVENTS_MODULE_ID = "events";

export const EVENT_STATUSES = ["open", "paused", "closed"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/** How a tag's per-day value is entered and shown: `1`, `8h`, `Y` / `N`, free text. */
export const TAG_TYPES = ["number", "boolean", "text"] as const;
export type TagType = (typeof TAG_TYPES)[number];

/** A quick-entry field defined once per event and filled in on any tracked day. */
export interface EventTag {
  id: string;
  name: string;
  type: TagType;
  /** Key into `TAG_ICONS` (see `icons.tsx`). */
  icon: string;
  /** Suffix for number tags, e.g. `h`, `mg`; empty for none. */
  unit: string;
}

export type TagValue = number | boolean | string;

/** A photo or PDF on an item; the data URL's MIME type tells them apart. */
export interface EventAttachment {
  id: string;
  name: string;
  /**
   * `data:image/jpeg;…` (compressed photo) or `data:application/pdf;…` (file as uploaded), stored
   * inline so the encrypted vault — and its backups — carry it.
   */
  dataUrl: string;
}

/** A free-form record on one day, e.g. `Height: 147.2 cm` or a lab report with photos / PDFs. */
export interface EventItem {
  id: string;
  label: string;
  value: string;
  /** Photos and PDFs. Keeps the `images` key from before PDFs so saved records load unchanged. */
  images: EventAttachment[];
}

export interface EventDay {
  /** Local calendar day `YYYY-MM-DD` — a day key, not an instant, so it never shifts timezone. */
  date: string;
  /** Tag id → value; absent means "not tracked that day". */
  tagValues: Record<string, TagValue>;
  items: EventItem[];
  note: string;
  /** Highlighted on the calendar; only stored when true. */
  milestone?: boolean;
}

export interface TrackedEvent {
  id: string;
  title: string;
  /** Markdown body. */
  description: string;
  status: EventStatus;
  tags: EventTag[];
  /** Sorted ascending by `date`; days with nothing tracked are dropped. */
  days: EventDay[];
  createdAt: string;
  updatedAt: string;
}

export interface EventFormInput {
  title: string;
  description: string;
  status: EventStatus;
  tags: EventTag[];
}
