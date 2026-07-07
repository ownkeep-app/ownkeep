import type { IndexEntry } from "@/modules/types";
import {
  PASSWORDS_MODULE_ID,
  type PasswordEntry,
  type PasswordFormInput,
} from "./types";

export function isPasswordEntry(value: unknown): value is PasswordEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<PasswordEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.name === "string" &&
    typeof entry.username === "string"
  );
}

export function passwordEntries(items: unknown[]): PasswordEntry[] {
  return items.filter(isPasswordEntry);
}

export function buildPasswordIndex(items: PasswordEntry[]): IndexEntry[] {
  return items.map((item) => ({
    id: item.id,
    moduleId: PASSWORDS_MODULE_ID,
    type: "password",
    searchString: [
      item.name,
      item.username,
      item.loginUrl,
      item.recoveryUrl,
      item.notes,
      item.tags.join(" "),
    ]
      .filter(Boolean)
      .join(" "),
    displayLine: `${item.name} - ${item.username || "no username"}`,
  }));
}

export function emptyPasswordForm(): PasswordFormInput {
  return {
    name: "",
    username: "",
    password: "",
    loginUrl: "",
    recoveryUrl: "",
    notes: "",
    tags: "",
  };
}

export function formFromPassword(item: PasswordEntry): PasswordFormInput {
  return {
    name: item.name,
    username: item.username,
    password: "",
    loginUrl: item.loginUrl,
    recoveryUrl: item.recoveryUrl,
    notes: item.notes,
    tags: item.tags.join(", "),
  };
}

export function createPasswordEntry(
  input: PasswordFormInput,
  now: string,
  id: string = crypto.randomUUID(),
): PasswordEntry {
  return normalizePasswordEntry(
    {
      id,
      ...input,
      tags: parseTags(input.tags),
      updatedAt: now,
    },
    now,
  );
}

export function updatePasswordEntry(
  existing: PasswordEntry,
  input: PasswordFormInput,
  now: string,
): PasswordEntry {
  return normalizePasswordEntry(
    {
      ...existing,
      name: input.name,
      username: input.username,
      password: input.password.trim() ? input.password : existing.password,
      loginUrl: input.loginUrl,
      recoveryUrl: input.recoveryUrl,
      notes: input.notes,
      tags: parseTags(input.tags),
      updatedAt: now,
    },
    now,
  );
}

export function validatePasswordInput(
  input: PasswordFormInput,
  mode: "create" | "edit",
): string | null {
  if (!input.name.trim()) return "Name is required.";
  if (mode === "create" && !input.password) return "Password is required.";
  return null;
}

export function parseTags(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

function normalizePasswordEntry(
  item: PasswordEntry,
  fallbackUpdatedAt: string,
): PasswordEntry {
  return {
    id: item.id,
    name: item.name.trim(),
    username: item.username.trim(),
    password: item.password,
    loginUrl: item.loginUrl.trim(),
    recoveryUrl: item.recoveryUrl.trim(),
    notes: item.notes.trim(),
    tags: item.tags,
    updatedAt: item.updatedAt || fallbackUpdatedAt,
  };
}
