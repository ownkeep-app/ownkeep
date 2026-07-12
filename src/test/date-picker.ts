import { screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/** Open a DatePicker by aria-label and choose a calendar day (`YYYY-MM-DD`). */
export async function pickDate(
  user: UserEvent,
  label: string | RegExp,
  ymd: string,
): Promise<void> {
  const [year, month, day] = ymd.split("-").map(Number);
  const target = new Date(year, month - 1, day);
  const dataDay = target.toLocaleDateString();
  await user.click(screen.getByLabelText(label));

  for (let step = 0; step < 36; step += 1) {
    const match = document.querySelector(`[data-day="${dataDay}"]`);
    if (match instanceof HTMLElement) {
      await user.click(match);
      return;
    }

    const caption = document.querySelector(".rdp-caption_label");
    const shown = caption?.textContent
      ? new Date(`${caption.textContent} 1`)
      : new Date();
    const shownMonth = new Date(shown.getFullYear(), shown.getMonth(), 1);
    const targetMonth = new Date(year, month - 1, 1);
    await user.click(
      screen.getByRole("button", {
        name:
          targetMonth.getTime() > shownMonth.getTime()
            ? /go to the next month/i
            : /go to the previous month/i,
      }),
    );
  }

  throw new Error(`Could not find calendar day ${ymd}`);
}
