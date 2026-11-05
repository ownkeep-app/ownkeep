import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FileThumbnail } from "./FileThumbnail";
import { MAX_THUMBNAIL_SOURCE_BYTES } from "./logic";
import type { FileEntry } from "./types";

function entry(mime: string, size = 10): FileEntry {
  return {
    id: "blob",
    title: "My file",
    category: "Personal",
    invalid: false,
    description: "",
    date: "2026-07-01",
    fileName: "file.bin",
    mime,
    size,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

const show = (mime: string, size?: number) =>
  render(<FileThumbnail file={entry(mime, size)} />).container;

const icon = (container: HTMLElement) => container.querySelector("svg");

describe("FileThumbnail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dims and stamps an invalid file, whatever its kind", () => {
    for (const mime of ["image/png", "application/octet-stream"]) {
      const { container, unmount } = render(
        <FileThumbnail file={{ ...entry(mime), invalid: true }} />,
      );
      expect(container).toHaveTextContent("Invalid");
      expect(container.firstElementChild).toHaveClass(
        "opacity-40",
        "grayscale",
      );
      unmount();
    }
  });

  it("leaves a valid file unmarked", () => {
    const container = show("image/png");
    expect(container).not.toHaveTextContent("Invalid");
    expect(container.firstElementChild).not.toHaveClass("opacity-40");
  });

  it("shows an image through the file scheme", () => {
    const img = show("image/png").querySelector("img")!;
    expect(img.getAttribute("src")).toBe(
      "ownkeep-file://localhost/blob/image/png",
    );
    expect(img.alt).toBe("");
  });

  it("shows a video's early frame, muted and reading only metadata", () => {
    const video = show("video/mp4").querySelector("video")!;
    expect(video.getAttribute("src")).toBe(
      "ownkeep-file://localhost/blob/video/mp4#t=0.1",
    );
    expect(video.muted).toBe(true);
    expect(video.preload).toBe("metadata");
    expect(video.controls).toBe(false);
  });

  it("shows a PDF's first page, out of the tab order", () => {
    const frame = show("application/pdf").querySelector("iframe")!;
    expect(frame.getAttribute("src")).toBe(
      "ownkeep-file://localhost/blob/application/pdf",
    );
    expect(frame.tabIndex).toBe(-1);
  });

  it("shows an icon and the extension for audio, opaque files and oversized images", () => {
    for (const container of [
      show("audio/mpeg"),
      show("application/octet-stream"),
      show("image/png", MAX_THUMBNAIL_SOURCE_BYTES + 1),
    ]) {
      expect(icon(container)).not.toBeNull();
      expect(container).toHaveTextContent("BIN");
      expect(container.querySelector("img, video, iframe")).toBeNull();
    }
  });

  it.each([
    ["image/png", "img"],
    ["video/mp4", "video"],
  ])("falls back to the icon when %s fails to load", (mime, tag) => {
    const container = show(mime);
    fireEvent.error(container.querySelector(tag)!);
    expect(container.querySelector(tag)).toBeNull();
    expect(icon(container)).not.toBeNull();
    expect(container).toHaveTextContent("BIN");
  });

  it("holds a preview only while its tile is near the viewport", () => {
    let report: IntersectionObserverCallback = () => {};
    const disconnect = vi.fn();
    const options: (IntersectionObserverInit | undefined)[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(
          callback: IntersectionObserverCallback,
          init?: IntersectionObserverInit,
        ) {
          report = callback;
          options.push(init);
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const setNear = (isIntersecting: boolean) =>
      act(() =>
        report(
          [{ isIntersecting } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        ),
      );

    const view = render(<FileThumbnail file={entry("image/png")} />);
    const img = () => view.container.querySelector("img");

    expect(img()).toBeNull();
    expect(options[0]?.rootMargin).toBe("200px");
    setNear(true);
    expect(img()).not.toBeNull();
    setNear(false);
    expect(img()).toBeNull();

    view.unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it("doesn't watch the viewport when there's nothing to load", () => {
    const observer = vi.fn();
    vi.stubGlobal("IntersectionObserver", observer);
    show("audio/mpeg");
    expect(observer).not.toHaveBeenCalled();
  });
});
