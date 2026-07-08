import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom lacks a few browser APIs that cmdk (the command palette) touches while rendering its list.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;
Element.prototype.scrollIntoView ??= () => {};

// uPlot (finance trend) reads `matchMedia` at import time to watch device-pixel-ratio; stub it.
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;

// Unmount rendered components after every test so listeners (e.g. window keydown) don't leak
// across tests. `vitest.config` doesn't enable `globals`, so RTL's auto-cleanup won't run on its own.
afterEach(() => {
  cleanup();
});
