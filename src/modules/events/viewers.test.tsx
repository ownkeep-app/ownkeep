import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AttachmentViewer } from "./AttachmentViewer";
import { TimelineView } from "./TimelineView";
import type { TrackedEvent } from "./types";

const event: TrackedEvent = {
  id: "e",
  title: "Growth",
  description: "",
  status: "open",
  tags: [
    { id: "w", name: "Weight", type: "number", icon: "weight", unit: "kg" },
  ],
  days: [
    {
      date: "2026-10-01",
      tagValues: { w: 36 },
      items: [],
      note: "",
    },
    {
      date: "2026-10-20",
      tagValues: {},
      items: [
        {
          id: "i",
          label: "Report",
          value: "ok",
          images: [
            { id: "img", name: "r.jpg", dataUrl: "data:image/jpeg;base64,AA" },
          ],
        },
      ],
      note: "follow-up",
    },
  ],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-20T00:00:00.000Z",
};

function stageTransform(): string {
  return (screen.getByRole("img") as HTMLImageElement).style.transform;
}

describe("TimelineView", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 25, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function cardLeft(date: string): number {
    const card = screen.getByRole("button", { name: `Open ${date}` });
    return parseFloat((card.parentElement as HTMLElement).style.left);
  }

  it("plots tracked days with their values and filters them", async () => {
    const user = userEvent.setup();
    const onOpenDay = vi.fn();
    render(<TimelineView event={event} onOpenDay={onOpenDay} />);

    const first = screen.getByRole("button", { name: "Open 2026-10-01" });
    expect(within(first).getByText("36kg")).toBeVisible();
    const second = screen.getByRole("button", { name: "Open 2026-10-20" });
    expect(within(second).getByText("follow-up")).toBeVisible();
    expect(within(second).getByText("1")).toBeVisible();
    expect(screen.getByText("Today")).toBeVisible();

    await user.click(second);
    expect(onOpenDay).toHaveBeenCalledWith("2026-10-20");

    await user.selectOptions(
      screen.getByLabelText("Timeline filter"),
      "item:report",
    );
    expect(
      screen.queryByRole("button", { name: "Open 2026-10-01" }),
    ).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Timeline filter"), "tag:w");
    expect(
      screen.queryByRole("button", { name: "Open 2026-10-20" }),
    ).not.toBeInTheDocument();
  });

  it("pans by drag and wheel, zooms by buttons and pinch, and re-centres", async () => {
    const user = userEvent.setup();
    const onOpenDay = vi.fn();
    render(<TimelineView event={event} onOpenDay={onOpenDay} />);
    const stage = screen.getByRole("region", { name: "Timeline" });
    const start = cardLeft("2026-10-01");

    fireEvent.pointerMove(stage, { clientX: 50 });
    expect(cardLeft("2026-10-01")).toBe(start);

    fireEvent.pointerDown(stage, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 160, pointerId: 1 });
    fireEvent.pointerUp(stage, { pointerId: 1 });
    expect(cardLeft("2026-10-01")).toBeCloseTo(start + 60);
    // The click that ends a drag must not open a day.
    fireEvent.click(screen.getByRole("button", { name: "Open 2026-10-01" }));
    expect(onOpenDay).not.toHaveBeenCalled();

    fireEvent.wheel(stage, { deltaY: 40 });
    expect(cardLeft("2026-10-01")).toBeCloseTo(start + 20);
    fireEvent.wheel(stage, { deltaX: -30, deltaY: 5 });
    expect(cardLeft("2026-10-01")).toBeCloseTo(start + 50);

    // Button zoom is anchored on the stage centre (800px fallback width in jsdom).
    const fromCentre = () => cardLeft("2026-10-01") - 400;
    const before = fromCentre();
    await user.click(screen.getByRole("button", { name: "Zoom in timeline" }));
    expect(fromCentre()).toBeCloseTo(before * 1.5);
    await user.click(screen.getByRole("button", { name: "Zoom out timeline" }));
    expect(fromCentre()).toBeCloseTo(before);
    // Pinch zoom is anchored on the cursor (x = 0 here), so a point right of it moves further right.
    const leftBefore = cardLeft("2026-10-01");
    fireEvent.wheel(stage, { deltaY: -100, ctrlKey: true, clientX: 0 });
    expect(cardLeft("2026-10-01")).toBeGreaterThan(leftBefore);

    await user.click(screen.getByRole("button", { name: "Fit timeline" }));
    expect(cardLeft("2026-10-01")).toBeCloseTo(start);
    await user.click(screen.getByRole("button", { name: "Today" }));
    // Today (Oct 25) is centred, so Oct 20 sits just left of the middle.
    expect(cardLeft("2026-10-20")).toBeGreaterThan(0);
    expect(cardLeft("2026-10-20")).toBeLessThan(400);
    fireEvent.pointerCancel(stage);
  });

  it("explains an empty timeline", () => {
    render(
      <TimelineView event={{ ...event, days: [] }} onOpenDay={() => {}} />,
    );
    expect(screen.getByText(/nothing tracked yet\./i)).toBeVisible();
  });
});

describe("AttachmentViewer", () => {
  const images = [
    { id: "a", name: "a.jpg", dataUrl: "data:image/jpeg;base64,AA" },
    { id: "b", name: "b.jpg", dataUrl: "data:image/jpeg;base64,BB" },
  ];

  it("zooms, pans, steps between images and closes from the keyboard", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <AttachmentViewer
        attachments={images}
        initialIndex={0}
        onClose={onClose}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Image a.jpg" });
    const stage = screen.getByTestId("image-stage");
    expect(screen.getByText("1 / 2")).toBeVisible();

    fireEvent.wheel(stage, { deltaY: -200, clientX: 0, clientY: 0 });
    expect(stageTransform()).toMatch(/scale\(1\.49/);

    fireEvent.pointerMove(stage, { clientX: 5, clientY: 5 });
    fireEvent.pointerDown(stage, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 30, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(stage);
    expect(stageTransform()).toContain("translate(20px, 40px)");

    await user.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(stageTransform()).toBe("translate(0px, 0px) scale(1)");

    fireEvent.doubleClick(stage, { clientX: 0, clientY: 0 });
    expect(stageTransform()).toContain("scale(2.5)");
    fireEvent.doubleClick(stage, { clientX: 0, clientY: 0 });
    expect(stageTransform()).toContain("scale(1)");

    for (const key of ["+", "=", "-", "0"]) fireEvent.keyDown(dialog, { key });
    expect(stageTransform()).toContain("scale(1)");
    await user.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(screen.getByText("80%")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByRole("dialog", { name: "Image b.jpg" })).toBeVisible();
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(screen.getByText("1 / 2")).toBeVisible();
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    await user.click(screen.getByRole("button", { name: "Previous image" }));
    expect(screen.getByText("1 / 2")).toBeVisible();

    fireEvent.keyDown(dialog, { key: "q" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a PDF in the built-in reader without photo zoom", () => {
    const createObjectURL = vi.fn(() => "blob:pdf-1");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL, revokeObjectURL }),
    );
    const files = [
      {
        id: "p",
        name: "血常规.pdf",
        dataUrl: "data:application/pdf;base64,JVBERg==",
      },
      images[0],
    ];
    const { unmount } = render(
      <AttachmentViewer
        attachments={files}
        initialIndex={0}
        onClose={() => {}}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "PDF 血常规.pdf" });
    expect(screen.getByTitle("血常规.pdf")).toHaveAttribute(
      "src",
      "blob:pdf-1",
    );
    expect(
      screen.queryByRole("button", { name: "Zoom in" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("image-stage")).not.toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "+" });
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();

    // Stepping to the photo brings the zoom controls back and frees the PDF's blob URL.
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByRole("dialog", { name: "Image a.jpg" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeVisible();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:pdf-1");
    unmount();
    vi.unstubAllGlobals();
  });

  it("hides stepping for a single image and renders nothing for a bad index", () => {
    const { unmount } = render(
      <AttachmentViewer
        attachments={[images[0]]}
        initialIndex={0}
        onClose={() => {}}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Next image" }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
    expect(screen.getByRole("dialog", { name: "Image a.jpg" })).toBeVisible();
    unmount();

    render(
      <AttachmentViewer
        attachments={images}
        initialIndex={5}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
