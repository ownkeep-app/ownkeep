import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FileViewer } from "./FileViewer";
import type { FileEntry } from "./types";

function entry(id: string, mime: string): FileEntry {
  return {
    id,
    title: `Title ${id}`,
    category: "Personal",
    invalid: false,
    description: "",
    date: "2026-07-01",
    fileName: `${id}.bin`,
    mime,
    size: 10,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

const image = entry("img", "image/png");
const pdf = entry("doc", "application/pdf");
const audio = entry("song", "audio/mpeg");
const video = entry("clip", "video/mp4");

function show(files: FileEntry[], initialIndex = 0) {
  const onClose = vi.fn();
  const onSaveCopy = vi.fn();
  const view = render(
    <FileViewer
      files={files}
      initialIndex={initialIndex}
      onClose={onClose}
      onSaveCopy={onSaveCopy}
    />,
  );
  return { onClose, onSaveCopy, ...view };
}

const dialog = () => screen.getByRole("dialog");
const pressKey = (key: string) => fireEvent.keyDown(dialog(), { key });
const media = (tag: string) => document.body.querySelector(tag)!;

describe("FileViewer", () => {
  it("marks an invalid file in the header, and only then", () => {
    const { unmount } = show([image]);
    expect(screen.queryByText("Invalid")).toBeNull();
    unmount();

    show([{ ...image, invalid: true }]);
    expect(screen.getByText("Invalid")).toBeVisible();
  });

  it("shows an image through the file scheme and zooms it", async () => {
    const user = userEvent.setup();
    show([image]);
    const img = screen.getByRole("img", {
      name: "Title img",
    }) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(
      "ownkeep-file://localhost/img/image/png",
    );
    expect(screen.getByText("100%")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("125%")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Zoom out" }));
    await user.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(screen.getByText("80%")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(screen.getByText("100%")).toBeVisible();

    pressKey("+");
    expect(screen.getByText("125%")).toBeVisible();
    pressKey("0");
    expect(screen.getByText("100%")).toBeVisible();
  });

  it("zooms with the wheel and pans by dragging", () => {
    show([image]);
    const stage = screen.getByTestId("image-stage");
    fireEvent.wheel(stage, { deltaY: -500, clientX: 10, clientY: 10 });
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.style.transform).not.toContain("scale(1)");

    fireEvent.pointerDown(stage, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 30, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(stage, { pointerId: 1 });
    const panned = img.style.transform;
    fireEvent.pointerMove(stage, { clientX: 90, clientY: 90, pointerId: 1 });
    expect(img.style.transform).toBe(panned);
  });

  it("opens a PDF in the WebView's reader, without photo zoom", () => {
    show([pdf]);
    expect(screen.getByTitle("Title doc").getAttribute("src")).toBe(
      "ownkeep-file://localhost/doc/application/pdf",
    );
    expect(screen.queryByRole("button", { name: "Zoom in" })).toBeNull();
  });

  it("plays audio and video with native controls", () => {
    const { unmount } = show([video]);
    const player = media("video") as HTMLVideoElement;
    expect(player.getAttribute("src")).toBe(
      "ownkeep-file://localhost/clip/video/mp4",
    );
    expect(player.controls).toBe(true);
    expect(player.preload).toBe("metadata");
    unmount();

    show([audio]);
    const sound = media("audio") as HTMLAudioElement;
    expect(sound.getAttribute("src")).toBe(
      "ownkeep-file://localhost/song/audio/mpeg",
    );
    expect(sound.controls).toBe(true);
  });

  it("steps through files with buttons and keys, wrapping and resetting zoom", async () => {
    const user = userEvent.setup();
    show([image, pdf], 0);
    expect(screen.getByText("1 / 2")).toBeVisible();

    pressKey("+");
    await user.click(screen.getByRole("button", { name: "Next file" }));
    expect(screen.getByText("2 / 2")).toBeVisible();
    expect(screen.getByTitle("Title doc")).toBeVisible();

    pressKey("ArrowRight");
    expect(screen.getByText("1 / 2")).toBeVisible();
    expect(screen.getByText("100%")).toBeVisible();

    pressKey("ArrowLeft");
    expect(screen.getByText("2 / 2")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Previous file" }));
    expect(screen.getByText("1 / 2")).toBeVisible();
  });

  it("offers no stepping for a single file", () => {
    show([image]);
    expect(screen.queryByRole("button", { name: "Next file" })).toBeNull();
    expect(screen.queryByText("1 / 1")).toBeNull();
    pressKey("ArrowRight");
    expect(screen.getByRole("img")).toBeVisible();
  });

  it("leaves arrow keys to the player while audio or video shows", () => {
    show([video, image], 0);
    pressKey("ArrowRight");
    expect(screen.getByText("1 / 2")).toBeVisible();
    // Zoom keys don't apply either.
    pressKey("+");
    expect(screen.queryByText("125%")).toBeNull();
  });

  it("closes on Escape and the close button, and ignores other keys", async () => {
    const user = userEvent.setup();
    const { onClose } = show([image]);
    pressKey("x");
    expect(onClose).not.toHaveBeenCalled();
    pressKey("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("saves a copy of the file showing", async () => {
    const user = userEvent.setup();
    const { onSaveCopy } = show([image]);
    await user.click(screen.getByRole("button", { name: "Save a copy" }));
    expect(onSaveCopy).toHaveBeenCalledWith(image);
  });

  it.each([
    ["an image", image, "img"],
    ["a video", video, "video"],
    ["an audio file", audio, "audio"],
  ])(
    "falls back to Save a copy when %s can't play",
    async (_label, file, tag) => {
      const user = userEvent.setup();
      const { onSaveCopy } = show([file]);

      fireEvent.error(media(tag));

      expect(screen.getByText(/can't be previewed/i)).toBeVisible();
      expect(media(tag)).toBeNull();
      expect(screen.queryByText("100%")).toBeNull();
      const buttons = screen.getAllByRole("button", { name: /save a copy/i });
      await user.click(buttons[buttons.length - 1]);
      expect(onSaveCopy).toHaveBeenCalledWith(file);
    },
  );

  it("clears a failed preview when stepping to another file", () => {
    show([video, pdf], 0);
    fireEvent.error(media("video"));
    expect(screen.getByText(/can't be previewed/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Next file" }));
    expect(screen.queryByText(/can't be previewed/i)).toBeNull();
    expect(screen.getByTitle("Title doc")).toBeVisible();
  });

  it("renders nothing for an empty list", () => {
    show([]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
