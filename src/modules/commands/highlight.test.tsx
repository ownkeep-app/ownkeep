import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { codeToHtml } from "shiki";
import { highlightCode, SnippetView } from "./highlight";

vi.mock("shiki", () => ({ codeToHtml: vi.fn() }));
const mockCodeToHtml = vi.mocked(codeToHtml);

describe("highlightCode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns Shiki HTML on success", async () => {
    mockCodeToHtml.mockResolvedValue("<pre>ok</pre>");
    expect(await highlightCode("echo hi", "bash")).toBe("<pre>ok</pre>");
    expect(mockCodeToHtml).toHaveBeenCalledWith("echo hi", {
      lang: "bash",
      theme: "github-dark",
    });
  });

  it("falls back to escaped plain text on failure, defaulting the language", async () => {
    mockCodeToHtml.mockRejectedValue(new Error("no grammar"));
    const html = await highlightCode("<script> & </script>", "");
    expect(html).toContain("&lt;script&gt; &amp; &lt;/script&gt;");
    expect(mockCodeToHtml).toHaveBeenCalledWith("<script> & </script>", {
      lang: "text",
      theme: "github-dark",
    });
  });
});

describe("SnippetView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows plain code first, then the highlighted HTML", async () => {
    let resolve!: (value: string) => void;
    mockCodeToHtml.mockReturnValue(
      new Promise<string>((r) => {
        resolve = r;
      }),
    );
    render(<SnippetView code="git status" language="bash" />);

    expect(screen.getByText("git status")).toBeInTheDocument(); // plain fallback

    resolve("<pre><code>highlighted</code></pre>");
    await waitFor(() =>
      expect(screen.getByText("highlighted")).toBeInTheDocument(),
    );
  });

  it("ignores a resolve that lands after unmount", async () => {
    let resolve!: (value: string) => void;
    mockCodeToHtml.mockReturnValue(
      new Promise<string>((r) => {
        resolve = r;
      }),
    );
    const { unmount } = render(<SnippetView code="x" language="bash" />);
    unmount();
    resolve("<pre>late</pre>");
    await Promise.resolve(); // no state update on the unmounted component
  });
});
