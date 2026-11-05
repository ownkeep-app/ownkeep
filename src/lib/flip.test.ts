import { afterEach, describe, expect, it, vi } from "vitest";

import { captureRects, prefersReducedMotion, slideFromPrevious } from "./flip";

function element(left: number, top: number) {
  const el = document.createElement("li");
  el.getBoundingClientRect = () => ({ left, top }) as DOMRect;
  el.animate = vi.fn();
  return el;
}

const before = (left: number, top: number) => ({ left, top }) as DOMRect;

describe("flip", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("captures where elements are now", () => {
    const a = element(1, 2);
    expect(captureRects([a]).get(a)).toMatchObject({ left: 1, top: 2 });
  });

  it("slides a moved element from its old place to its new one", () => {
    const moved = element(10, 200);
    slideFromPrevious(new Map([[moved, before(10, 50)]]));

    expect(moved.animate).toHaveBeenCalledTimes(1);
    const [keyframes] = vi.mocked(moved.animate).mock.calls[0];
    expect(keyframes).toEqual([
      { transform: "translate(0px, -150px)" },
      { transform: "translate(0, 0)" },
    ]);
  });

  it("leaves alone what didn't move and what something else is animating", () => {
    const still = element(10, 10);
    const skipped = element(0, 0);
    slideFromPrevious(
      new Map([
        [still, before(10, 10)],
        [skipped, before(50, 50)],
      ]),
      skipped,
    );
    expect(still.animate).not.toHaveBeenCalled();
    expect(skipped.animate).not.toHaveBeenCalled();
  });

  it("doesn't animate for anyone who prefers reduced motion", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);
    const moved = element(10, 200);

    expect(prefersReducedMotion()).toBe(true);
    slideFromPrevious(new Map([[moved, before(10, 50)]]));

    expect(moved.animate).not.toHaveBeenCalled();
  });
});
