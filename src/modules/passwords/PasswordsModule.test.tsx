import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toastError, toastSecretCopied } from "@/lib/toast";
import { useVaultStore } from "@/stores/vault-store";
import { PasswordsListView } from "./PasswordsModule";
import type { PasswordEntry } from "./types";

vi.mock("@/lib/toast", () => ({
  toastSecretCopied: vi.fn(),
  toastError: vi.fn(),
}));

const toasts = {
  toastSecretCopied: vi.mocked(toastSecretCopied),
  toastError: vi.mocked(toastError),
};

const actions = {
  savePassword: useVaultStore.getState().savePassword,
  deletePassword: useVaultStore.getState().deletePassword,
  copySecret: useVaultStore.getState().copySecret,
  revealSecret: useVaultStore.getState().revealSecret,
};

const item: PasswordEntry = {
  id: "github",
  name: "GitHub",
  username: "sha",
  password: "super-secret-value",
  loginUrl: "https://github.com/login",
  recoveryUrl: "https://github.com/password_reset",
  notes: "dev account",
  tags: ["dev", "work"],
  updatedAt: "2026-07-07T00:00:00.000Z",
};

describe("PasswordsListView", () => {
  const savePassword = vi.fn(async () => {});
  const deletePassword = vi.fn(async () => {});
  const copySecret = vi.fn(async () => {});
  const revealSecret = vi.fn(async () => {});

  beforeEach(() => {
    vi.clearAllMocks();
    useVaultStore.setState({
      savePassword,
      deletePassword,
      copySecret,
      revealSecret,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useVaultStore.setState(actions);
  });

  it("renders metadata and never renders the password value", () => {
    render(<PasswordsListView items={[item]} />);

    expect(screen.getByRole("heading", { name: "Passwords" })).toBeVisible();
    expect(screen.getAllByText("GitHub")[0]).toBeVisible();
    expect(screen.getAllByText("sha")[0]).toBeVisible();
    expect(screen.queryByText("super-secret-value")).not.toBeInTheDocument();
    expect(screen.getAllByText("********")[0]).toBeVisible();
  });

  it("filters password rows by metadata", async () => {
    const user = userEvent.setup();
    render(
      <PasswordsListView
        items={[
          item,
          {
            ...item,
            id: "mail",
            name: "Fastmail",
            username: "me@example.com",
            tags: ["personal"],
          },
        ]}
      />,
    );

    await user.type(screen.getByLabelText(/filter passwords/i), "personal");

    expect(screen.getAllByText("Fastmail")[0]).toBeVisible();
    expect(screen.queryByText("GitHub")).not.toBeInTheDocument();
  });

  it("sorts rows by clicked table headers", async () => {
    const user = userEvent.setup();
    render(
      <PasswordsListView
        items={[
          item,
          {
            ...item,
            id: "aws",
            name: "AWS",
            username: "root",
            tags: ["cloud"],
          },
          {
            ...item,
            id: "mail",
            name: "Fastmail",
            username: "me@example.com",
            tags: ["personal"],
          },
        ]}
      />,
    );

    expect(passwordRowNames()).toEqual(["AWS", "Fastmail", "GitHub"]);

    await user.click(
      screen.getByRole("button", { name: /sort username ascending/i }),
    );
    expect(passwordRowNames()).toEqual(["Fastmail", "AWS", "GitHub"]);

    await user.click(
      screen.getByRole("button", { name: /sort username descending/i }),
    );
    expect(passwordRowNames()).toEqual(["GitHub", "AWS", "Fastmail"]);

    await user.click(
      screen.getByRole("button", { name: /sort tags ascending/i }),
    );
    expect(passwordRowNames()).toEqual(["AWS", "GitHub", "Fastmail"]);

    await user.click(
      screen.getByRole("button", { name: /sort password ascending/i }),
    );
    expect(passwordRowNames()).toEqual(["AWS", "Fastmail", "GitHub"]);
  });

  it("shows a no-matches state when the filter excludes everything", async () => {
    const user = userEvent.setup();
    render(<PasswordsListView items={[item]} />);

    await user.type(screen.getByLabelText(/filter passwords/i), "zzz-nomatch");

    expect(screen.getByText(/no matches/i)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "New password" }),
    ).not.toBeInTheDocument();
  });

  it("copies through the store without exposing the secret", async () => {
    const user = userEvent.setup();
    render(<PasswordsListView items={[item]} />);

    await user.click(
      screen.getAllByRole("button", { name: /copy password/i })[0],
    );

    expect(copySecret).toHaveBeenCalledWith("github", "password");
    expect(screen.queryByText("super-secret-value")).not.toBeInTheDocument();
    expect(toasts.toastSecretCopied).toHaveBeenCalled();
  });

  it("toasts an error when the copy fails", async () => {
    const user = userEvent.setup();
    copySecret.mockRejectedValueOnce(new Error("no clipboard"));
    render(<PasswordsListView items={[item]} />);

    await user.click(
      screen.getAllByRole("button", { name: /copy password/i })[0],
    );

    expect(toasts.toastError).toHaveBeenCalledWith(
      "Couldn't copy the password.",
    );
  });

  it("reveals from the masked password cell through the Rust-owned command", async () => {
    const user = userEvent.setup();
    render(<PasswordsListView items={[item]} />);

    await user.click(
      screen.getByRole("button", { name: /reveal password for github/i }),
    );

    expect(revealSecret).toHaveBeenCalledWith("github", "password");
    expect(screen.queryByText("super-secret-value")).not.toBeInTheDocument();
  });

  it("reveals through the Rust-owned command without rendering the secret", async () => {
    const user = userEvent.setup();
    render(<PasswordsListView items={[item]} />);

    await user.click(screen.getByRole("button", { name: /view github/i }));
    const dialog = screen.getByRole("dialog", { name: "GitHub" });
    await user.click(
      within(dialog).getByRole("button", {
        name: /reveal password for github/i,
      }),
    );

    expect(revealSecret).toHaveBeenCalledWith("github", "password");
    expect(screen.queryByText("super-secret-value")).not.toBeInTheDocument();
  });

  it("toasts an error when reveal fails", async () => {
    const user = userEvent.setup();
    revealSecret.mockRejectedValueOnce(new Error("locked"));
    render(<PasswordsListView items={[item]} />);

    await user.click(screen.getByRole("button", { name: /view github/i }));
    const dialog = screen.getByRole("dialog", { name: "GitHub" });
    await user.click(
      within(dialog).getByRole("button", {
        name: /reveal password for github/i,
      }),
    );

    expect(toasts.toastError).toHaveBeenCalledWith(
      "Couldn't reveal the password.",
    );
  });

  it("creates a password entry from the edit form", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "new-id" });
    render(<PasswordsListView items={[]} />);

    await user.click(screen.getByRole("button", { name: "New" }));
    await user.type(screen.getByLabelText("Password name"), "GitHub");
    await user.type(screen.getByLabelText("Password username"), "sha");
    await user.type(screen.getByLabelText("Password value"), "secret");
    await user.type(screen.getByLabelText("Login URL"), "https://github.com");
    await user.type(screen.getByLabelText("Password tags"), "dev, work");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(savePassword).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "new-id",
        name: "GitHub",
        username: "sha",
        password: "secret",
        loginUrl: "https://github.com",
        tags: ["dev", "work"],
      }),
    );
  });

  it("shows a validation error and does not save when the form is invalid", async () => {
    const user = userEvent.setup();
    render(<PasswordsListView items={[]} />);

    await user.click(screen.getByRole("button", { name: "New" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(savePassword).not.toHaveBeenCalled();
    expect(screen.getByText(/required/i)).toBeVisible();
  });

  it("edits metadata while keeping an unchanged password redacted", async () => {
    const user = userEvent.setup();
    render(
      <PasswordsListView
        items={[{ ...item, password: "__KEYSTASH_REDACTED_SECRET__" }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /edit github/i }));
    await user.clear(screen.getByLabelText("Password name"));
    await user.type(screen.getByLabelText("Password name"), "GitHub Pro");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(savePassword).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "github",
        name: "GitHub Pro",
        password: "__KEYSTASH_REDACTED_SECRET__",
      }),
    );
  });

  it("deletes an entry through the store", async () => {
    const user = userEvent.setup();
    render(<PasswordsListView items={[item]} />);

    await user.click(screen.getByRole("button", { name: /delete github/i }));

    expect(deletePassword).toHaveBeenCalledWith("github");
  });

  it("opens login URLs only for valid http(s) values", async () => {
    const user = userEvent.setup();
    const open = vi.fn();
    vi.stubGlobal("open", open);

    render(
      <PasswordsListView
        items={[item, { ...item, id: "ftp", name: "FTP", loginUrl: "ftp://x" }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /view github/i }));
    await user.click(screen.getByRole("button", { name: item.loginUrl }));
    expect(open).toHaveBeenCalledWith(
      item.loginUrl,
      "_blank",
      "noopener,noreferrer",
    );

    await user.click(screen.getByRole("button", { name: /view ftp/i }));
    await user.click(screen.getByRole("button", { name: "ftp://x" }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("keeps invalid URLs inert in the detail view", async () => {
    const user = userEvent.setup();
    const open = vi.fn();
    vi.stubGlobal("open", open);

    render(
      <PasswordsListView
        items={[{ ...item, id: "bad", name: "Bad", loginUrl: "not a url" }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /view bad/i }));
    await user.click(screen.getByRole("button", { name: "not a url" }));
    expect(open).not.toHaveBeenCalled();
  });
});

function passwordRowNames(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent ?? "");
}
