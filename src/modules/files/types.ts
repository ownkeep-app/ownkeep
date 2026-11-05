export const FILES_MODULE_ID = "files";

/** A stored file's metadata. Its contents are an encrypted blob named by `id` (spec §4.8). */
export interface FileEntry {
  /** Stable id, also the blob's id. */
  id: string;
  title: string;
  category: string;
  description: string;
  /** Expired or no longer valid, but kept as a record: listed apart, with a stamped preview. */
  invalid: boolean;
  /** The date the user files this under, `YYYY-MM-DD`. Defaults to the file's modified date. */
  date: string;
  /** Original file name, used when saving a copy. */
  fileName: string;
  /** Content type the file is previewed with; opaque types are stored but never rendered. */
  mime: string;
  /** Plaintext size in bytes. */
  size: number;
  createdAt: string;
  updatedAt: string;
}

export interface FileFormInput {
  title: string;
  category: string;
  invalid: boolean;
  description: string;
  date: string;
}

export type FileKind = "image" | "pdf" | "audio" | "video" | "other";
