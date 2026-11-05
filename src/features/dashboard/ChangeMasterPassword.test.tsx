import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toastSuccess } from "@/lib/toast";
import { vaultApi } from "@/vault/api";
import { ChangeMasterPassword } from "./ChangeMasterPassword";

vi.mock("@/vault/api", () => ({
  vaultApi: { changeMasterVerified: vi.fn(async () => {}) },
}));
vi.mock("@/lib/toast", () => ({ toastSuccess: vi.fn() }));

const change = vi.mocked(vaultApi.changeMasterVerified);

async function openForm(user: ReturnType<typeof userEvent.setup>) {
  render(<ChangeMasterPassword />);
  await user.click(screen.getByRole("button", { name: "Change" }));
}

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  current: string,
  next: string,
  confirm = next,
) {
  if (current) {
    await user.type(screen.getByLabelText("Current master password"), current);
  }
  await user.type(screen.getByLabelText("New master password"), next);
  await user.type(screen.getByLabelText("Confirm password"), confirm);
  await user.click(screen.getByRole("button", { name: "Change password" }));
}

describe("ChangeMasterPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts closed, as a row with a Change button", () => {
    render(<ChangeMasterPassword />);
    expect(screen.getByText("Master password")).toBeVisible();
    expect(screen.queryByLabelText("Current master password")).toBeNull();
  });

  it("masks every field and warns about existing backups", async () => {
    const user = userEvent.setup();
    await openForm(user);

    for (const label of [
      "Current master password",
      "New master password",
      "Confirm password",
    ]) {
      expect(screen.getByLabelText(label)).toHaveAttribute("type", "password");
    }
    expect(screen.getByText(/Backups you've already made/)).toBeVisible();
  });

  it("can't be submitted without the current password", async () => {
    const user = userEvent.setup();
    await openForm(user);
    await fill(user, "", "brand new password");
    expect(change).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Change password" }),
    ).toBeDisabled();
  });

  it.each([
    ["a short new password", "short", "short", "Use at least 8 characters."],
    [
      "a mismatched confirmation",
      "brand new password",
      "something else entirely",
      "Passwords don't match.",
    ],
    [
      "the same password again",
      "current password",
      "current password",
      "The new password is the same as the current one.",
    ],
  ])(
    "refuses %s before reaching Rust",
    async (_label, next, confirm, message) => {
      const user = userEvent.setup();
      await openForm(user);
      await fill(user, "current password", next, confirm);

      expect(screen.getByRole("alert")).toHaveTextContent(message);
      expect(change).not.toHaveBeenCalled();
    },
  );

  it("changes it, confirms, and clears the passwords out of the form", async () => {
    const user = userEvent.setup();
    await openForm(user);
    await fill(user, "current password", "brand new password");

    expect(change).toHaveBeenCalledWith(
      "current password",
      "brand new password",
    );
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Master password changed."),
    );
    expect(screen.queryByLabelText("Current master password")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByLabelText("Current master password")).toHaveValue("");
    expect(screen.getByLabelText("New master password")).toHaveValue("");
  });

  it("explains a wrong current password and stays open to retry", async () => {
    const user = userEvent.setup();
    change.mockRejectedValueOnce(
      "authentication failed (wrong password/recovery code, or corrupted data)",
    );
    await openForm(user);
    await fill(user, "wrong password", "brand new password");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That isn't your current master password.",
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Current master password")).toBeVisible();
  });

  it("shows any other failure as it is", async () => {
    const user = userEvent.setup();
    change.mockRejectedValueOnce("I/O error: disk full");
    await openForm(user);
    await fill(user, "current password", "brand new password");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "I/O error: disk full",
    );
  });

  it("shows progress and blocks a second submit while changing", async () => {
    const user = userEvent.setup();
    let finish = () => {};
    change.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    await openForm(user);
    await fill(user, "current password", "brand new password");

    const button = screen.getByRole("button", { name: "Changing…" });
    expect(button).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    finish();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Changing…" })).toBeNull(),
    );
  });

  it("cancels without changing anything, forgetting what was typed", async () => {
    const user = userEvent.setup();
    await openForm(user);
    await user.type(
      screen.getByLabelText("Current master password"),
      "current password",
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(change).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByLabelText("Current master password")).toHaveValue("");
  });
});
