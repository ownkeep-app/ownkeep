import { screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/** Open a DatePicker by aria-label and choose a calendar day (`YYYY-MM-DD`). */
export async function pickDate(
  user: UserEvent,
  label: string | RegExp,
  ymd: string,
): Promise<void> {
  const [year, month, day] = ymd.split("-").map(Number);
  const dataDay = new Date(year, month - 1, day).toLocaleDateString();
  await user.click(screen.getByLabelText(label));

  await user.selectOptions(
    screen.getByRole("combobox", { name: /choose the year/i }),
    String(year),
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: /choose the month/i }),
    String(month - 1),
  );
  const match = document.querySelector(`[data-day="${dataDay}"]`);
  if (match instanceof HTMLElement) {
    await user.click(match);
    return;
  }

  throw new Error(`Could not find calendar day ${ymd}`);
}
