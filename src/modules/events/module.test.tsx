import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TagIcon } from "./icons";
import { eventsModule } from "./module";
import type { TrackedEvent } from "./types";

const DetailView = eventsModule.DetailView!;
const EditView = eventsModule.EditView!;

const event: TrackedEvent = {
  id: "event-1",
  title: "Height of My Son",
  description: "Growth **checks**",
  status: "paused",
  tags: [],
  days: [{ date: "2026-10-28", tagValues: {}, items: [], note: "x" }],
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-10-28T00:00:00.000Z",
};

describe("eventsModule surface", () => {
  it("declares a Dashboard-first module with its own scope", () => {
    expect(eventsModule).toEqual(
      expect.objectContaining({
        id: "events",
        titleKey: "module.events",
        enabledByDefault: true,
        searchableByDefault: false,
        scopePrefix: "e",
      }),
    );
    expect(eventsModule.createEmpty()).toEqual([]);
    expect(eventsModule.buildIndex([event, { junk: true }])).toHaveLength(1);
  });

  it("renders list, detail and edit surfaces and ignores foreign items", () => {
    const { unmount } = render(<eventsModule.ListView items={[event]} />);
    expect(screen.getByText("Height of My Son")).toBeVisible();
    unmount();

    const detail = render(<DetailView item={event} />);
    expect(screen.getByText("Paused")).toBeVisible();
    expect(screen.getByText("checks")).toBeVisible();
    detail.unmount();

    render(<DetailView item={{ ...event, description: "" }} />);
    expect(screen.getByText("No description.")).toBeVisible();

    const { container } = render(<DetailView item={{ not: "an event" }} />);
    expect(container).toBeEmptyDOMElement();

    render(
      <EditView item={{ bad: true }} onCancel={() => {}} onSave={() => {}} />,
    );
    expect(screen.getByRole("heading", { name: "New event" })).toBeVisible();
  });

  it("falls back to the default icon for unknown keys", () => {
    const { container } = render(<TagIcon icon="does-not-exist" />);
    expect(container.querySelector("svg")).toHaveClass("lucide-tag");
  });
});
