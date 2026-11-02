import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelDelete,
  chooseRowAction,
  confirmDelete,
} from "@/test/row-actions";
import { useVaultStore } from "@/stores/vault-store";
import { createDefaultModel } from "@/vault/model";
import { EventsListView } from "./EventsModule";
import { readAttachment } from "./attachment";
import type { TrackedEvent } from "./types";

vi.mock("@/vault/api", () => ({
  vaultApi: { saveVault: vi.fn(async () => {}) },
}));
vi.mock("./attachment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./attachment")>()),
  readAttachment: vi.fn(),
}));

const sleepEvent: TrackedEvent = {
  id: "sleep",
  title: "Sleeping of My Wife",
  description: "Doctor asked for **two weeks** of notes.",
  status: "open",
  tags: [
    { id: "pills", name: "安眠药", type: "number", icon: "pill", unit: "" },
    { id: "hours", name: "睡眠时长", type: "number", icon: "moon", unit: "h" },
    { id: "dreams", name: "多梦", type: "boolean", icon: "brain", unit: "" },
    { id: "mood", name: "Mood", type: "text", icon: "smile", unit: "" },
  ],
  days: [
    {
      date: "2026-10-30",
      tagValues: { pills: 1, hours: 7.5, dreams: false },
      items: [],
      note: "",
    },
  ],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-31T00:00:00.000Z",
};

const heightEvent: TrackedEvent = {
  id: "height",
  title: "Height of My Son",
  description: "",
  status: "closed",
  tags: [],
  days: [
    {
      date: "2026-10-28",
      tagValues: {},
      items: [
        { id: "h1", label: "Height", value: "147.2 cm", images: [] },
        { id: "h2", label: "Weight", value: "37 kg", images: [] },
        { id: "h3", label: "骨龄", value: "12周岁", images: [] },
        {
          id: "h4",
          label: "检查报告-血常规",
          value: "",
          images: [
            {
              id: "img1",
              name: "血常规.jpg",
              dataUrl: "data:image/jpeg;base64,AA",
            },
            {
              id: "img2",
              name: "肝功.jpg",
              dataUrl: "data:image/jpeg;base64,BB",
            },
          ],
        },
      ],
      note: "Annual checkup",
    },
  ],
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-10-28T00:00:00.000Z",
};

/** Renders the pane from the live store so saves flow back into the view, as in the Dashboard. */
function Harness() {
  const items = useVaultStore((s) => s.model?.modules.events);
  return <EventsListView items={Array.isArray(items) ? items : []} />;
}

/** A recorded day opens read-only; press Edit in its View modal to reach the editor. */
async function editFromView(user: ReturnType<typeof userEvent.setup>) {
  const view = await screen.findByRole("dialog", { name: / · / });
  await user.click(within(view).getByRole("button", { name: "Edit" }));
}

function storedEvents(): TrackedEvent[] {
  return useVaultStore.getState().model?.modules.events as TrackedEvent[];
}

function seed(events: TrackedEvent[]) {
  useVaultStore.setState({
    model: {
      ...createDefaultModel("2026-11-01T00:00:00.000Z"),
      modules: { events },
    },
  });
}

describe("EventsListView", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 1, 9, 0));
    seed([sleepEvent, heightEvent]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(readAttachment).mockReset();
  });

  it("lists events and filters by status and text", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByText("2 tracked events")).toBeVisible();
    expect(screen.getByText("安眠药")).toBeVisible();

    await user.selectOptions(
      screen.getByLabelText("Filter by status"),
      "closed",
    );
    expect(screen.queryByText("Sleeping of My Wife")).not.toBeInTheDocument();
    expect(screen.getByText("Height of My Son")).toBeVisible();

    await user.selectOptions(screen.getByLabelText("Filter by status"), "");
    await user.type(screen.getByLabelText("Filter events"), "睡眠");
    expect(screen.getByText("Sleeping of My Wife")).toBeVisible();
    expect(screen.queryByText("Height of My Son")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Filter events"), "nothing");
    expect(screen.getByText("No matches")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.getByText("Height of My Son")).toBeVisible();
  });

  it("shows the empty state and creates an event with tags", async () => {
    seed([]);
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByText("No events yet")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "New event" }));

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Title is required.")).toBeVisible();

    await user.type(screen.getByLabelText("Event title"), "Sleep");
    await user.click(screen.getByRole("button", { name: "Add tag" }));
    await user.click(screen.getByRole("button", { name: "Add tag" }));
    await user.type(screen.getByLabelText("Tag 1 name"), "Hours");
    await user.type(screen.getByLabelText("Tag 1 unit"), "h");
    await user.click(screen.getByRole("button", { name: "Tag 1 icon" }));
    await user.click(screen.getByRole("radio", { name: "moon" }));
    await user.type(screen.getByLabelText("Tag 2 name"), "Dreams");
    await user.selectOptions(screen.getByLabelText("Tag 2 type"), "boolean");
    expect(screen.getByLabelText("Tag 2 unit")).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Status"), "paused");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(storedEvents()).toHaveLength(1));
    expect(storedEvents()[0]).toEqual(
      expect.objectContaining({
        title: "Sleep",
        status: "paused",
        tags: [
          expect.objectContaining({
            name: "Hours",
            unit: "h",
            icon: "moon",
            type: "number",
          }),
          expect.objectContaining({
            name: "Dreams",
            type: "boolean",
            unit: "",
          }),
        ],
      }),
    );
    // Saving opens the new event straight away.
    expect(screen.getByRole("heading", { name: "Sleep" })).toBeVisible();
  });

  it("edits, removes tags, and deletes events from the list menu", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await chooseRowAction(user, "Sleeping of My Wife", "Edit");
    expect(screen.getByText(/removing a tag also removes/i)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Remove tag 1" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        storedEvents().find((event) => event.id === "sleep")?.tags,
      ).toHaveLength(3),
    );
    expect(
      storedEvents().find((event) => event.id === "sleep")?.days[0].tagValues,
    ).toEqual({
      hours: 7.5,
      dreams: false,
    });

    await user.click(screen.getByRole("button", { name: "Back to events" }));
    await chooseRowAction(user, "Height of My Son", "Delete");
    await confirmDelete(user);
    await waitFor(() =>
      expect(storedEvents().map((event) => event.id)).toEqual(["sleep"]),
    );
  });

  it("opens an event from the menu, toggles its description and status, and deletes it", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await chooseRowAction(user, "Sleeping of My Wife", "Open");
    expect(screen.queryByText("two weeks")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Description" }));
    expect(screen.getByText("two weeks")).toBeVisible();

    await user.selectOptions(screen.getByLabelText("Event status"), "closed");
    await waitFor(() => expect(storedEvents()[0].status).toBe("closed"));

    await chooseRowAction(user, "Sleeping of My Wife", "Edit");
    expect(screen.getByRole("heading", { name: "Edit event" })).toBeVisible();
    await user.click(screen.getByText("Cancel"));

    await chooseRowAction(user, "Sleeping of My Wife", "Delete");
    await confirmDelete(user);
    await waitFor(() =>
      expect(storedEvents().map((event) => event.id)).toEqual(["height"]),
    );
    expect(screen.getByText("1 tracked event")).toBeVisible();
  });

  it("tracks today's tags from the calendar", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(
      screen.getByRole("button", { name: "Sleeping of My Wife" }),
    );

    expect(
      screen.getByRole("heading", { name: /11月|November/ }),
    ).toBeVisible();
    const existing = screen.getByRole("gridcell", {
      name: "2026-10-30, tracked",
    });
    expect(within(existing).getByText("7.5h")).toBeVisible();
    expect(within(existing).getByText("N")).toBeVisible();

    await user.click(screen.getByRole("gridcell", { name: "2026-11-01" }));
    await user.type(screen.getByLabelText("安眠药"), "1");
    await user.type(screen.getByLabelText("睡眠时长"), "eight");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("睡眠时长 must be a number.")).toBeVisible();

    await user.clear(screen.getByLabelText("睡眠时长"));
    await user.type(screen.getByLabelText("睡眠时长"), "8");
    const dreams = screen.getByRole("radiogroup", { name: "多梦" });
    await user.click(within(dreams).getByRole("radio", { name: "N" }));
    await user.click(within(dreams).getByRole("radio", { name: "N" }));
    expect(within(dreams).getByRole("radio", { name: "N" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await user.click(within(dreams).getByRole("radio", { name: "Y" }));
    await user.type(screen.getByLabelText("Mood"), "calm");
    await user.type(screen.getByLabelText("Day note"), "Slept well");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(storedEvents()[0].days).toHaveLength(2));
    expect(storedEvents()[0].days[1]).toEqual({
      date: "2026-11-01",
      tagValues: { pills: 1, hours: 8, dreams: true, mood: "calm" },
      items: [],
      note: "Slept well",
    });
    const today = screen.getByRole("gridcell", { name: "2026-11-01, tracked" });
    expect(within(today).getByText("8h")).toBeVisible();
    expect(within(today).getByText("Y")).toBeVisible();
  });

  it("navigates months and clears a day by emptying it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(
      screen.getByRole("button", { name: "Sleeping of My Wife" }),
    );

    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByRole("gridcell", { name: "2026-10-01" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next month" }));
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("gridcell", { name: "2026-12-31" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Today" }));

    await user.click(
      screen.getByRole("gridcell", { name: "2026-10-30, tracked" }),
    );
    await editFromView(user);
    expect(screen.getByText("Editing")).toBeVisible();
    await user.clear(screen.getByLabelText("安眠药"));
    await user.clear(screen.getByLabelText("睡眠时长"));
    const dreams = screen.getByRole("radiogroup", { name: "多梦" });
    await user.click(within(dreams).getByRole("radio", { name: "N" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(storedEvents()[0].days).toEqual([]));

    await user.click(screen.getByRole("gridcell", { name: "2026-11-02" }));
    await user.click(screen.getByText("Cancel"));
    expect(screen.getByRole("grid")).toBeVisible();
  });

  it("keeps the browsed month after saving or cancelling a day", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(
      screen.getByRole("button", { name: "Sleeping of My Wife" }),
    );
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    await user.click(screen.getByRole("button", { name: "Previous month" }));

    await user.click(screen.getByRole("gridcell", { name: "2026-09-15" }));
    await user.type(screen.getByLabelText("安眠药"), "2");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByRole("gridcell", { name: "2026-09-15, tracked" }),
    ).toBeVisible();

    await user.click(screen.getByRole("gridcell", { name: "2026-09-16" }));
    await user.click(screen.getByText("Cancel"));
    expect(screen.getByRole("gridcell", { name: "2026-09-30" })).toBeVisible();
    expect(
      screen.queryByRole("gridcell", { name: "2026-11-30" }),
    ).not.toBeInTheDocument();
  });

  it("marks a day as a milestone and highlights it on the calendar", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Height of My Son" }));

    // An untracked day can be a milestone on its own.
    await user.click(screen.getByRole("gridcell", { name: "2026-11-03" }));
    const toggle = screen.getByRole("button", { name: /milestone day/i });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const cell = await screen.findByRole("gridcell", {
      name: "2026-11-03, tracked, milestone",
    });
    expect(within(cell).getByLabelText("Milestone")).toBeInTheDocument();
    expect(storedEvents()[1].days[1]).toEqual({
      date: "2026-11-03",
      tagValues: {},
      items: [],
      note: "",
      milestone: true,
    });

    // Un-marking an otherwise empty day removes it.
    await user.click(cell);
    await editFromView(user);
    await user.click(screen.getByRole("button", { name: /milestone day/i }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByRole("gridcell", { name: "2026-11-03" }),
    ).toBeVisible();
    expect(storedEvents()[1].days).toHaveLength(1);
  });

  it("records items with photos and PDFs and views them", async () => {
    vi.mocked(readAttachment).mockImplementation(async (file: File) => ({
      id: `file-${file.name}`,
      name: file.name,
      dataUrl: file.name.endsWith(".pdf")
        ? "data:application/pdf;base64,JVBERg=="
        : "data:image/jpeg;base64,CC",
    }));
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Height of My Son" }));

    const cell = screen.getByRole("gridcell", { name: "2026-10-28, tracked" });
    expect(within(cell).getByText("+1 more")).toBeVisible();
    expect(within(cell).getByText("Annual checkup")).toHaveClass(
      "line-clamp-2",
    );
    expect(within(cell).getByText("2")).toBeVisible();
    await user.click(cell);
    await editFromView(user);

    expect(screen.queryByText("Tags")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.type(screen.getByLabelText("Item 5 value"), "normal");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Every item needs a name.")).toBeVisible();
    await user.type(screen.getByLabelText("Item 5 name"), "检查报告-肝功");

    const file = new File(["x"], "liver.png", { type: "image/png" });
    await user.upload(screen.getByTestId("item-5-images"), file);
    expect(
      await screen.findByRole("button", { name: "View liver.png" }),
    ).toBeVisible();
    await user.upload(screen.getByTestId("item-5-images"), []);

    // A PDF shows as a file tile; one failing file doesn't drop the others picked with it.
    vi.mocked(readAttachment).mockRejectedValueOnce(
      new Error("“big.pdf” is larger than 10 MB."),
    );
    await user.upload(screen.getByTestId("item-5-images"), [
      new File(["%PDF"], "big.pdf", { type: "application/pdf" }),
      new File(["%PDF"], "liver.pdf", { type: "application/pdf" }),
    ]);
    const pdfTile = await screen.findByRole("button", {
      name: "View liver.pdf",
    });
    expect(within(pdfTile).getByText("liver.pdf")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "View big.pdf" }),
    ).not.toBeInTheDocument();

    vi.mocked(readAttachment).mockRejectedValueOnce("not an error");
    await user.upload(screen.getByTestId("item-5-images"), file);

    await user.click(screen.getByRole("button", { name: "Remove item 2" }));
    await user.click(screen.getByRole("button", { name: "Remove 肝功.jpg" }));

    await user.click(screen.getByRole("button", { name: "View 血常规.jpg" }));
    const viewer = screen.getByRole("dialog", { name: "Image 血常规.jpg" });
    expect(within(viewer).getByText("100%")).toBeVisible();
    await user.click(within(viewer).getByRole("button", { name: "Zoom in" }));
    expect(within(viewer).getByText("125%")).toBeVisible();
    await user.click(
      within(viewer).getByRole("button", { name: "Close image" }),
    );
    expect(
      screen.queryByRole("dialog", { name: /^Image/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(storedEvents()[1].days[0].items).toHaveLength(4),
    );
    const items = storedEvents()[1].days[0].items;
    expect(items.map((item) => item.label)).toEqual([
      "Height",
      "骨龄",
      "检查报告-血常规",
      "检查报告-肝功",
    ]);
    expect(items[2].images.map((image) => image.name)).toEqual(["血常规.jpg"]);
    expect(items[3]).toEqual(
      expect.objectContaining({
        value: "normal",
        images: [
          expect.objectContaining({ name: "liver.png" }),
          expect.objectContaining({
            name: "liver.pdf",
            dataUrl: expect.stringMatching(/^data:application\/pdf;/),
          }),
        ],
      }),
    );
  });

  it("previews a CSV import and saves it only on confirm", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(
      screen.getByRole("button", { name: "Sleeping of My Wife" }),
    );

    const csv = (text: string) =>
      new File([text], "sleep.csv", { type: "text/csv" });
    const input = screen.getByTestId("csv-import-input");

    // A file with nothing importable can only be cancelled.
    await user.upload(input, csv("when,睡眠时长\nyesterday,7\n"));
    const empty = await screen.findByRole("dialog", { name: "Import CSV" });
    expect(within(empty).getByText(/needs a “date” column/)).toBeVisible();
    expect(
      within(empty).getByRole("button", { name: "Import" }),
    ).toBeDisabled();
    await user.click(within(empty).getByRole("button", { name: "Cancel" }));
    // The dialog fades out before it unmounts.
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Import CSV" }),
      ).not.toBeInTheDocument(),
    );

    await chooseRowAction(user, "Sleeping of My Wife", "Import CSV");
    await user.upload(
      input,
      csv(
        "date,睡眠时长,Naps,milestone\n2026-10-30,8,1,Y\n2026-11-03,6.5,,\n2026-11-04,bad,,\n",
      ),
    );
    const dialog = await screen.findByRole("dialog", { name: "Import CSV" });
    expect(dialog).toHaveTextContent("1 new day, 1 existing day updated.");
    expect(dialog).toHaveTextContent("New tags: Naps (number)");
    expect(dialog).toHaveTextContent(
      "Line 4: 睡眠时长: “bad” isn't a valid value, skipped.",
    );
    expect(storedEvents()[0].days).toHaveLength(1);

    await user.click(within(dialog).getByRole("button", { name: "Import" }));
    await waitFor(() => expect(storedEvents()[0].days).toHaveLength(2));
    const imported = storedEvents()[0];
    expect(imported.tags.map((tag) => tag.name)).toContain("Naps");
    expect(imported.days[0]).toEqual(
      expect.objectContaining({ date: "2026-10-30", milestone: true }),
    );
    expect(imported.days[0].tagValues.hours).toBe(8);
    expect(
      screen.getByRole("gridcell", { name: "2026-10-30, tracked, milestone" }),
    ).toBeVisible();
  });

  it("shows a recorded day read-only, then edits or deletes it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Height of My Son" }));
    await user.click(
      screen.getByRole("gridcell", { name: "2026-10-28, tracked" }),
    );

    const view = await screen.findByRole("dialog", {
      name: / · Height of My Son$/,
    });
    expect(screen.queryByText("Editing")).not.toBeInTheDocument();
    expect(within(view).getByText("147.2 cm")).toBeVisible();
    expect(within(view).getByText("检查报告-血常规")).toBeVisible();
    expect(within(view).getByText("Annual checkup")).toBeVisible();
    expect(within(view).queryByText("Milestone")).not.toBeInTheDocument();

    await user.click(
      within(view).getByRole("button", { name: "View 肝功.jpg" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Image 肝功.jpg" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close image" }));

    await user.click(within(view).getByRole("button", { name: "Edit" }));
    expect(screen.getByText("Editing")).toBeVisible();
    await user.click(screen.getByText("Cancel"));

    await user.click(
      screen.getByRole("gridcell", { name: "2026-10-28, tracked" }),
    );
    await user.click(
      within(await screen.findByRole("dialog", { name: / · / })).getByRole(
        "button",
        {
          name: "Delete",
        },
      ),
    );
    await confirmDelete(user);
    await waitFor(() => expect(storedEvents()[1].days).toEqual([]));
  });

  it("labels a milestone-only day in its View", async () => {
    seed([
      {
        ...heightEvent,
        days: [
          {
            date: "2026-10-29",
            tagValues: {},
            items: [],
            note: "",
            milestone: true,
          },
        ],
      },
    ]);
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Height of My Son" }));
    await user.click(
      screen.getByRole("gridcell", { name: "2026-10-29, tracked, milestone" }),
    );
    const view = await screen.findByRole("dialog", { name: / · / });
    expect(within(view).getByText("Milestone")).toBeVisible();
    expect(within(view).getByText(/nothing else recorded/)).toBeVisible();
    await user.click(
      within(view).getByRole("button", { name: "Close details" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: / · / }),
      ).not.toBeInTheDocument(),
    );
  });

  it("deletes a day record after confirmation", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Height of My Son" }));

    // A day with no record has nothing to delete.
    await user.click(screen.getByRole("gridcell", { name: "2026-11-03" }));
    expect(
      screen.queryByRole("button", { name: "Delete day" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByText("Cancel"));

    await user.click(
      screen.getByRole("gridcell", { name: "2026-10-28, tracked" }),
    );
    await editFromView(user);
    await user.click(screen.getByRole("button", { name: "Delete day" }));
    await cancelDelete(user);
    expect(storedEvents()[1].days).toHaveLength(1);
    expect(screen.getByText("Editing")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Delete day" }));
    await confirmDelete(user);
    await waitFor(() => expect(storedEvents()[1].days).toEqual([]));
    expect(
      await screen.findByRole("gridcell", { name: "2026-10-28" }),
    ).toBeVisible();
    expect(screen.queryByText("Editing")).not.toBeInTheDocument();
  });

  it("reveals an event requested by the command bar", async () => {
    const onHandled = vi.fn();
    const { rerender } = render(
      <EventsListView
        focusItemId="missing"
        items={[sleepEvent]}
        onFocusItemHandled={onHandled}
      />,
    );
    expect(onHandled).not.toHaveBeenCalled();
    rerender(
      <EventsListView
        focusItemId="sleep"
        items={[sleepEvent]}
        onFocusItemHandled={onHandled}
      />,
    );
    expect(
      await screen.findByRole("heading", { name: "Sleeping of My Wife" }),
    ).toBeVisible();
    expect(onHandled).toHaveBeenCalledTimes(1);
  });

  it("switches to the timeline and opens a day from it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(
      screen.getByRole("button", { name: "Sleeping of My Wife" }),
    );
    await user.click(screen.getByRole("tab", { name: "Timeline" }));

    expect(screen.getByRole("region", { name: "Timeline" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Open 2026-10-30" }));
    const view = await screen.findByRole("dialog", {
      name: / · Sleeping of My Wife$/,
    });
    expect(within(view).getByText("7.5h")).toBeVisible();
    await act(async () => {
      fireEvent.keyDown(view, { key: "Escape" });
    });
    expect(screen.getByRole("region", { name: "Timeline" })).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Trending" }));
    expect(
      screen.getByRole("img", { name: "安眠药 line chart" }),
    ).toBeVisible();
  });
});
