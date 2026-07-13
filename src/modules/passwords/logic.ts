import type { IndexEntry } from "@/modules/types";
import { defaultCategory, type TaxonomySettings } from "@/vault/taxonomy";
import {
  PASSWORDS_MODULE_ID,
  type PasswordEntry,
  type PasswordFormInput,
} from "./types";

export const GENERATED_PASSWORD_DIGITS = "0123456789";
export const GENERATED_PASSWORD_LOWER = "abcdefghijklmnopqrstuvwxyz";
export const GENERATED_PASSWORD_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** Specials from the create-form Generate charset. */
export const GENERATED_PASSWORD_SPECIALS =
  "!@#$%^&*()_+-=~[];',.?|{}:\"<>/";

export const GENERATED_PASSWORD_CHARSET =
  GENERATED_PASSWORD_DIGITS +
  GENERATED_PASSWORD_LOWER +
  GENERATED_PASSWORD_UPPER +
  GENERATED_PASSWORD_SPECIALS;

export const GENERATED_PASSWORD_LENGTH = 16;

/** Minimum length that can hold 1 digit + 1 lower + 1 upper + 2 specials. */
export const GENERATED_PASSWORD_MIN_LENGTH = 5;

type CharClass = "digit" | "lower" | "upper" | "special";

const CHAR_CLASS_SETS: Record<CharClass, string> = {
  digit: GENERATED_PASSWORD_DIGITS,
  lower: GENERATED_PASSWORD_LOWER,
  upper: GENERATED_PASSWORD_UPPER,
  special: GENERATED_PASSWORD_SPECIALS,
};

const CHAR_CLASSES = Object.keys(CHAR_CLASS_SETS) as CharClass[];

/**
 * Cryptographically random password: at least one digit, one lower, one upper,
 * and two specials; remaining slots are balanced across classes. Classes are
 * arranged so adjacent characters use different types whenever possible.
 */
export function generateSecurePassword(
  length: number = GENERATED_PASSWORD_LENGTH,
  randomBytes: (size: number) => Uint8Array = defaultRandomBytes,
): string {
  if (length <= 0) return "";
  const size = Math.max(length, GENERATED_PASSWORD_MIN_LENGTH);
  const rng = createByteStream(randomBytes);

  const counts: Record<CharClass, number> = {
    digit: 1,
    lower: 1,
    upper: 1,
    special: 2,
  };
  let remaining = size - GENERATED_PASSWORD_MIN_LENGTH;
  while (remaining > 0) {
    // Prefer under-filled classes so types stay balanced for interleaving.
    const min = Math.min(...CHAR_CLASSES.map((c) => counts[c]));
    const candidates = CHAR_CLASSES.filter((c) => counts[c] === min);
    counts[pickOne(candidates, rng)] += 1;
    remaining -= 1;
  }

  const sequence = interleaveClasses(counts, rng);
  return sequence.map((cls) => pickChar(CHAR_CLASS_SETS[cls], rng)).join("");
}

export function classifyGeneratedPasswordChar(
  char: string,
): CharClass | null {
  if (GENERATED_PASSWORD_DIGITS.includes(char)) return "digit";
  if (GENERATED_PASSWORD_LOWER.includes(char)) return "lower";
  if (GENERATED_PASSWORD_UPPER.includes(char)) return "upper";
  if (GENERATED_PASSWORD_SPECIALS.includes(char)) return "special";
  return null;
}

function interleaveClasses(
  counts: Record<CharClass, number>,
  rng: ByteStream,
): CharClass[] {
  const remaining = { ...counts };
  const sequence: CharClass[] = [];
  let last: CharClass | null = null;
  const total = CHAR_CLASSES.reduce((sum, c) => sum + remaining[c], 0);

  for (let i = 0; i < total; i += 1) {
    const available = CHAR_CLASSES.filter((c) => remaining[c] > 0);
    const preferred = available.filter((c) => c !== last);
    const pool = preferred.length > 0 ? preferred : available;
    const max = Math.max(...pool.map((c) => remaining[c]));
    const top = pool.filter((c) => remaining[c] === max);
    const chosen = pickOne(top, rng);
    sequence.push(chosen);
    remaining[chosen] -= 1;
    last = chosen;
  }

  return sequence;
}

function pickChar(charset: string, rng: ByteStream): string {
  const bound = charset.length;
  const acceptBelow = 256 - (256 % bound);
  for (;;) {
    const byte = rng.next();
    if (byte >= acceptBelow) continue;
    return charset[byte % bound]!;
  }
}

function pickOne<T>(items: readonly T[], rng: ByteStream): T {
  return items[rng.next() % items.length]!;
}

type ByteStream = { next: () => number };

function createByteStream(
  randomBytes: (size: number) => Uint8Array,
): ByteStream {
  let buffer = new Uint8Array(0);
  let offset = 0;
  return {
    next() {
      if (offset >= buffer.length) {
        buffer = randomBytes(64);
        offset = 0;
      }
      return buffer[offset++]!;
    },
  };
}

function defaultRandomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function isPasswordEntry(value: unknown): value is PasswordEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<PasswordEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.name === "string" &&
    typeof entry.username === "string" &&
    typeof entry.category === "string"
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
      item.category,
    ]
      .filter(Boolean)
      .join(" "),
    displayLine: `${item.name} - ${item.username || "no username"}`,
  }));
}

export function emptyPasswordForm(
  settings?: TaxonomySettings,
): PasswordFormInput {
  return {
    name: "",
    username: "",
    password: "",
    loginUrl: "",
    recoveryUrl: "",
    notes: "",
    category: defaultCategory(settings),
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
    category: item.category,
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
      category: input.category.trim(),
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
  if (!input.category.trim()) return "Category is required.";
  if (mode === "create" && !input.password) return "Password is required.";
  return null;
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
    category: item.category.trim(),
    updatedAt: item.updatedAt || fallbackUpdatedAt,
  };
}
