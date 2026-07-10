import { describe, expect, it } from "vitest";

import {
  buildPasswordIndex,
  createPasswordEntry,
  emptyPasswordForm,
  updatePasswordEntry,
  validatePasswordInput,
} from "./logic";
import type { PasswordEntry } from "./types";

const NOW = "2026-07-07T00:00:00.000Z";

const existing: PasswordEntry = {
  id: "github",
  name: "GitHub",
  username: "sha",
  password: "__KEYSTASH_REDACTED_SECRET__",
  loginUrl: "https://github.com/login",
  recoveryUrl: "https://github.com/password_reset",
  notes: "dev account",
  category: "Personal",
  updatedAt: NOW,
};

describe("password module logic", () => {
  it("builds searchable entries without the secret value", () => {
    const index = buildPasswordIndex([
      { ...existing, password: "super-secret-value" },
    ]);

    expect(index).toEqual([
      expect.objectContaining({
        id: "github",
        moduleId: "passwords",
        type: "password",
        displayLine: "GitHub - sha",
      }),
    ]);
    expect(index[0].searchString).toContain("GitHub");
    expect(index[0].searchString).not.toContain("super-secret-value");
  });

  it("normalizes new entries and category", () => {
    const form = {
      ...emptyPasswordForm(),
      name: "  GitHub  ",
      username: " sha ",
      password: "secret",
      category: " Dev ",
    };

    expect(createPasswordEntry(form, NOW, "1")).toEqual(
      expect.objectContaining({
        id: "1",
        name: "GitHub",
        username: "sha",
        password: "secret",
        category: "Dev",
      }),
    );
  });

  it("preserves the existing password marker when edits leave the password blank", () => {
    const updated = updatePasswordEntry(
      existing,
      { ...emptyPasswordForm(), name: "GitHub Enterprise" },
      "2026-07-08T00:00:00.000Z",
    );

    expect(updated.name).toBe("GitHub Enterprise");
    expect(updated.password).toBe("__KEYSTASH_REDACTED_SECRET__");
    expect(updated.updatedAt).toBe("2026-07-08T00:00:00.000Z");
  });

  it("validates required fields by mode", () => {
    expect(validatePasswordInput(emptyPasswordForm(), "create")).toMatch(
      /name/i,
    );
    expect(
      validatePasswordInput(
        { ...emptyPasswordForm(), name: "GitHub" },
        "create",
      ),
    ).toMatch(/password/i);
    expect(
      validatePasswordInput({ ...emptyPasswordForm(), name: "GitHub" }, "edit"),
    ).toBeNull();
  });
});
