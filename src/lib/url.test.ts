import { beforeEach, describe, expect, it, vi } from "vitest";

import { isHttpUrl, openExternalUrl } from "./url";

const openUrl = vi.fn(async (_url: string) => {});

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: (url: string) => openUrl(url),
}));

describe("url helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts only http(s) URLs for isHttpUrl", () => {
    expect(isHttpUrl("https://github.com/login")).toBe(true);
    expect(isHttpUrl("http://example.com")).toBe(true);
    expect(isHttpUrl("ftp://x")).toBe(false);
    expect(isHttpUrl("mailto:a@b.c")).toBe(false);
    expect(isHttpUrl("not a url")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
  });

  it("opens http(s) URLs through the Tauri opener", async () => {
    await expect(openExternalUrl("https://github.com/login")).resolves.toBe(
      true,
    );
    expect(openUrl).toHaveBeenCalledWith("https://github.com/login");
  });

  it("opens mailto URLs through the Tauri opener", async () => {
    await expect(
      openExternalUrl("mailto:caishaojiang@gmail.com"),
    ).resolves.toBe(true);
    expect(openUrl).toHaveBeenCalledWith("mailto:caishaojiang@gmail.com");
  });

  it("falls back to window.open when opener IPC is unavailable", async () => {
    openUrl.mockRejectedValueOnce(new Error("no ipc"));
    const open = vi.fn();
    vi.stubGlobal("open", open);

    await expect(openExternalUrl("https://keystash.info/")).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith(
      "https://keystash.info/",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("rejects unsupported schemes", async () => {
    await expect(openExternalUrl("ftp://x")).resolves.toBe(false);
    await expect(openExternalUrl("not a url")).resolves.toBe(false);
    expect(openUrl).not.toHaveBeenCalled();
  });
});
