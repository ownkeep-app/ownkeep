import { act, fireEvent, render, screen } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { vaultApi } from "@/vault/api";
import { TransferProgress } from "./TransferProgress";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@/vault/api", () => ({
  vaultApi: { cancelTransfer: vi.fn(async () => {}) },
}));

type Listener = (event: { payload: unknown }) => void;

describe("TransferProgress", () => {
  const listeners = new Map<string, Listener>();
  const stop = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    listeners.clear();
    vi.mocked(listen).mockImplementation(async (name, listener) => {
      listeners.set(name as string, listener as Listener);
      return stop;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function progress(payload: Record<string, unknown>) {
    act(() =>
      listeners.get("file-transfer-progress")!({
        payload: {
          kind: "backup",
          name: "ownkeep.okbak",
          done: 512,
          total: 1024,
          ...payload,
        },
      }),
    );
  }

  const finish = () =>
    act(() => listeners.get("file-transfer-done")!({ payload: null }));
  const advance = () => act(() => vi.advanceTimersByTime(300));

  it("stays out of the way of a fast transfer", () => {
    render(<TransferProgress />);
    progress({});
    expect(screen.queryByRole("dialog")).toBeNull();
    finish();
    advance();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows name, percent and sizes once a transfer runs long", () => {
    render(<TransferProgress />);
    progress({});
    advance();

    expect(screen.getByRole("dialog", { name: "Backing up…" })).toBeVisible();
    expect(screen.getByText("ownkeep.okbak")).toBeVisible();
    expect(screen.getByText("512 B / 1.0 KB")).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "50",
    );

    progress({ done: 1024 });
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  });

  it.each([
    ["import", "Adding files…"],
    ["export", "Saving a copy…"],
    ["restore", "Restoring…"],
  ])("titles a %s transfer", (kind, title) => {
    render(<TransferProgress />);
    progress({ kind });
    advance();
    expect(screen.getByRole("dialog", { name: title })).toBeVisible();
  });

  it("never reports over 100%, or divides by an empty total", () => {
    render(<TransferProgress />);
    progress({ done: 5000 });
    advance();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    progress({ done: 0, total: 0 });
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
  });

  it("cancels on request and closes when done", () => {
    render(<TransferProgress />);
    progress({});
    advance();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(vaultApi.cancelTransfer).toHaveBeenCalledTimes(1);

    finish();
    expect(screen.queryByRole("dialog")).toBeNull();

    // The next transfer waits again rather than reappearing instantly.
    progress({});
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stops listening when unmounted", async () => {
    const { unmount } = render(<TransferProgress />);
    unmount();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(stop).toHaveBeenCalledTimes(2);
  });
});
