import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDragGhost } from "./drag-ghost";

const rect = (left: number, top: number) =>
  ({ left, top, width: 200, height: 100 }) as DOMRect;

function makeItem(html = "<span>Report</span>") {
  const item = document.createElement("li");
  item.setAttribute("data-sort-id", "a");
  item.className = "card";
  item.innerHTML = html;
  item.getBoundingClientRect = () => rect(10, 20);
  document.body.appendChild(item);
  return item;
}

const ghostElement = () =>
  document.querySelector<HTMLElement>("[data-drag-ghost]")!;

describe("createDragGhost", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("floats a copy exactly over the item, hidden from the drag and from assistive tech", () => {
    createDragGhost(makeItem());
    const copy = ghostElement();

    expect(copy).toHaveTextContent("Report");
    expect(copy).toHaveClass("card");
    expect(copy).not.toHaveAttribute("data-sort-id");
    expect(copy).toHaveAttribute("aria-hidden", "true");
    expect(copy.style.position).toBe("fixed");
    expect(copy.style.left).toBe("10px");
    expect(copy.style.top).toBe("20px");
    expect(copy.style.width).toBe("200px");
    expect(copy.style.height).toBe("100px");
    expect(copy.style.pointerEvents).toBe("none");
  });

  it("follows the pointer", () => {
    createDragGhost(makeItem()).moveBy(30, -5);
    expect(ghostElement().style.transform).toBe("translate(30px, -5px)");
  });

  it("glides onto the target, then reports landing", () => {
    const onLanded = vi.fn();
    createDragGhost(makeItem()).landOn(rect(110, 220), onLanded);

    const copy = ghostElement();
    expect(copy.style.transition).toContain("transform");
    expect(copy.style.transform).toBe("translate(100px, 200px)");
    expect(onLanded).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(onLanded).toHaveBeenCalledTimes(1);
  });

  it("lands at once for anyone who prefers reduced motion", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);
    const onLanded = vi.fn();

    createDragGhost(makeItem()).landOn(rect(110, 220), onLanded);

    expect(onLanded).toHaveBeenCalledTimes(1);
    expect(ghostElement().style.transition).toBe("");
  });

  it("disappears when removed, even mid-landing", () => {
    const onLanded = vi.fn();
    const ghost = createDragGhost(makeItem());
    ghost.landOn(rect(0, 0), onLanded);

    ghost.remove();
    vi.runAllTimers();

    expect(ghostElement()).toBeNull();
    expect(onLanded).not.toHaveBeenCalled();
  });

  it("never loads a preview again: images copy, video and PDF don't", () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    const item = makeItem(
      '<video class="clip" src="x.mp4"></video><iframe class="page" src="x.pdf"></iframe>',
    );
    const video = item.querySelector("video")!;

    createDragGhost(item);
    const copy = ghostElement();

    expect(copy.querySelector("video, iframe")).toBeNull();
    expect(copy.querySelector("canvas")).toHaveClass("clip");
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0);
    expect(copy.querySelector("div.page")).not.toBeNull();
    // The originals are left alone.
    expect(item.querySelector("video, iframe")).not.toBeNull();
  });
});
