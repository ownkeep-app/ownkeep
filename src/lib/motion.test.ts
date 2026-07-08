import { describe, expect, it } from "vitest";

import {
  TAP_SCALE,
  fadeTransition,
  listItem,
  motionOrUndefined,
  switchThumbTransition,
  tapTransition,
} from "./motion";

describe("motion presets", () => {
  it("exposes calm spring / fade presets", () => {
    expect(TAP_SCALE).toBeLessThan(1);
    expect(tapTransition.type).toBe("spring");
    expect(switchThumbTransition.type).toBe("spring");
    expect(fadeTransition.duration).toBeLessThanOrEqual(0.2);
    expect(listItem.initial).toEqual({ opacity: 0, y: 4 });
  });

  it("drops animation props when reduced motion is preferred", () => {
    expect(motionOrUndefined(true, { scale: TAP_SCALE })).toBeUndefined();
    expect(motionOrUndefined(false, { scale: TAP_SCALE })).toEqual({
      scale: TAP_SCALE,
    });
    expect(motionOrUndefined(null, { opacity: 0 })).toEqual({ opacity: 0 });
  });
});
