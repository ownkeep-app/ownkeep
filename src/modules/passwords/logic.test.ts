import { describe, expect, it } from "vitest";

import {
  buildPasswordIndex,
  classifyGeneratedPasswordChar,
  createPasswordEntry,
  emptyPasswordForm,
  GENERATED_PASSWORD_CHARSET,
  GENERATED_PASSWORD_LENGTH,
  GENERATED_PASSWORD_SPECIALS,
  generateSecurePassword,
  isPasswordEntry,
  passwordEntries,
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
      { ...existing, id: "empty-user", username: "" },
    ]);

    expect(index[0]).toEqual(
      expect.objectContaining({
        id: "github",
        moduleId: "passwords",
        type: "password",
        displayLine: "GitHub - sha",
      }),
    );
    expect(index[1].displayLine).toBe("GitHub - no username");
    expect(index[0].searchString).toContain("GitHub");
    expect(index[0].searchString).not.toContain("super-secret-value");
  });

  it("filters invalid password-like values", () => {
    expect(isPasswordEntry(null)).toBe(false);
    expect(isPasswordEntry({ id: "missing" })).toBe(false);
    expect(passwordEntries([existing, { id: "missing" }])).toEqual([existing]);
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

  it("replaces the password when edits provide one", () => {
    const updated = updatePasswordEntry(
      existing,
      { ...emptyPasswordForm(), name: "GitHub", password: " new-secret " },
      "2026-07-08T00:00:00.000Z",
    );

    expect(updated.password).toBe(" new-secret ");
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
      validatePasswordInput(
        {
          ...emptyPasswordForm(),
          name: "GitHub",
          password: "secret",
          category: "",
        },
        "create",
      ),
    ).toMatch(/category/i);
    expect(
      validatePasswordInput({ ...emptyPasswordForm(), name: "GitHub" }, "edit"),
    ).toBeNull();
  });

  it("generates passwords with required classes interleaved", () => {
    let next = 0;
    const randomBytes = (size: number) =>
      Uint8Array.from({ length: size }, () => (next++ * 17) % 256);

    for (let i = 0; i < 20; i += 1) {
      const password = generateSecurePassword(
        GENERATED_PASSWORD_LENGTH,
        randomBytes,
      );
      expect(password).toHaveLength(GENERATED_PASSWORD_LENGTH);
      expect(
        [...password].every((ch) => GENERATED_PASSWORD_CHARSET.includes(ch)),
      ).toBe(true);

      const classes = [...password].map((ch) =>
        classifyGeneratedPasswordChar(ch),
      );
      expect(classes.every((c) => c !== null)).toBe(true);
      expect(classes.filter((c) => c === "digit").length).toBeGreaterThanOrEqual(
        1,
      );
      expect(classes.filter((c) => c === "lower").length).toBeGreaterThanOrEqual(
        1,
      );
      expect(classes.filter((c) => c === "upper").length).toBeGreaterThanOrEqual(
        1,
      );
      expect(
        classes.filter((c) => c === "special").length,
      ).toBeGreaterThanOrEqual(2);

      for (let j = 1; j < classes.length; j += 1) {
        expect(classes[j]).not.toBe(classes[j - 1]);
      }
    }

    expect(generateSecurePassword(0)).toBe("");
  });

  it("rejects biased high bytes when sampling a character set", () => {
    // Drive generation with bytes that skip a rejectable value, then land on index 3
    // of the specials set during later picks — composition still holds.
    const specialsLen = GENERATED_PASSWORD_SPECIALS.length;
    const acceptBelow = 256 - (256 % specialsLen);
    let calls = 0;
    const password = generateSecurePassword(5, (size) => {
      calls += 1;
      return Uint8Array.from({ length: size }, (_, i) => {
        // Mix usable low bytes so class picks and char picks succeed.
        if (i === 0 && calls === 1) return acceptBelow; // rejected for some picks
        return (i * 3) % 200;
      });
    });
    expect(password).toHaveLength(5);
    expect(
      [...password].filter((ch) => GENERATED_PASSWORD_SPECIALS.includes(ch))
        .length,
    ).toBeGreaterThanOrEqual(2);
  });
});
