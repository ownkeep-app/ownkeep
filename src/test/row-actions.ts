import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/** Open a row's ⋮ menu and pick a labeled menuitem. */
export async function chooseRowAction(
  user: UserEvent,
  rowName: string,
  action: string,
): Promise<void> {
  await user.click(
    screen.getByRole("button", {
      name: new RegExp(`actions for ${rowName}`, "i"),
    }),
  );
  await user.click(
    screen.getByRole("menuitem", { name: new RegExp(`^${action}$`, "i") }),
  );
}

/** Confirm the shared delete alertdialog (after choosing Delete). */
export async function confirmDelete(user: UserEvent): Promise<void> {
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));
}

/** Cancel the shared delete alertdialog. */
export async function cancelDelete(user: UserEvent): Promise<void> {
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: /^cancel$/i }));
}
