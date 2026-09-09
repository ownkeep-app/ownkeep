export const NOTES_MODULE_ID = "notes";

export interface NoteEntry {
  id: string;
  /** Display title of the note. */
  name: string;
  /** ISO timestamp when the note was created. */
  createdAt: string;
  /** ISO timestamp of the last edit. */
  updatedAt: string;
  category: string;
  /** Markdown body. */
  content: string;
}

export interface NoteFormInput {
  name: string;
  category: string;
  content: string;
}
