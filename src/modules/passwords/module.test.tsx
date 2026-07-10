import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { passwordsModule } from "./module";
import type { PasswordEntry } from "./types";

// The registry types these views as optional; the passwords module always provides them.
const DetailView = passwordsModule.DetailView!;
const EditView = passwordsModule.EditView!;

describe("passwordsModule surface", () => {
  it("returns null for non-password items in the DetailView", () => {
    const { container } = render(<DetailView item={{ not: "a password" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("treats non-password edit items as create mode", async () => {
    const user = userEvent.setup();
    const onSave = () => {};
    const onCancel = () => {};

    render(
      <EditView
        item={{ not: "a password" }}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /new password/i }),
    ).toBeVisible();

    await user.type(screen.getByLabelText("Password name"), "GitHub");
    await user.type(screen.getByLabelText("Password value"), "secret");
  });

  it("renders details for valid password items", () => {
    const entry: PasswordEntry = {
      id: "github",
      name: "GitHub",
      username: "sha",
      password: "__KEYSTASH_REDACTED_SECRET__",
      loginUrl: "https://github.com/login",
      recoveryUrl: "",
      notes: "",
      category: "Personal",
      updatedAt: "2026-07-07T00:00:00.000Z",
    };

    render(<DetailView item={entry} />);
    expect(screen.getByRole("heading", { name: "GitHub" })).toBeVisible();
  });

  it("renders edit mode for valid password items", () => {
    const entry: PasswordEntry = {
      id: "github",
      name: "GitHub",
      username: "sha",
      password: "__KEYSTASH_REDACTED_SECRET__",
      loginUrl: "",
      recoveryUrl: "",
      notes: "",
      category: "Personal",
      updatedAt: "2026-07-07T00:00:00.000Z",
    };

    render(<EditView item={entry} onSave={() => {}} onCancel={() => {}} />);

    expect(
      screen.getByRole("heading", { name: /edit password/i }),
    ).toBeVisible();
  });
});
