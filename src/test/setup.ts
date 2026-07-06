import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount rendered components after every test so listeners (e.g. window keydown) don't leak
// across tests. `vitest.config` doesn't enable `globals`, so RTL's auto-cleanup won't run on its own.
afterEach(() => {
  cleanup();
});
