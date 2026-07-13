import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { codeToTokens } from "shiki";
import { writeClipboard } from "@/lib/clipboard";
import { toastClipboard } from "@/lib/toast";
import {
  highlightSnippetLines,
  splitCodeLines,
} from "./highlight-code";
import { SnippetView } from "./highlight";

vi.mock("shiki", () => ({ codeToTokens: vi.fn() }));
vi.mock("@/lib/clipboard", () => ({ writeClipboard: vi.fn(async () => true) }));
vi.mock("@/lib/toast", () => ({ toastClipboard: vi.fn() }));

const mockCodeToTokens = vi.mocked(codeToTokens);
const clip = vi.mocked(writeClipboard);
const toastClip = vi.mocked(toastClipboard);

function tokensResult(
  lines: string[],
  extras: Partial<{ bg: string; fg: string }> = {},
) {
  return {
    tokens: lines.map((line, lineIndex) => [
      {
        content: line,
        offset: lineIndex,
        color: "#79B8FF",
        fontStyle: 0,
      },
    ]),
    fg: "#e1e4e8",
    bg: "#24292e",
    themeName: "github-dark" as const,
    ...extras,
  };
}

describe("splitCodeLines", () => {
  it("splits on newlines including empty lines", () => {
    expect(splitCodeLines("a\n\nb")).toEqual(["a", "", "b"]);
  });
});

describe("highlightSnippetLines", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns Shiki token lines on success", async () => {
    mockCodeToTokens.mockResolvedValue(tokensResult(["echo hi"]) as never);
    const result = await highlightSnippetLines("echo hi", "bash");
    expect(result.lines).toEqual([
      [{ content: "echo hi", color: "#79B8FF", fontStyle: 0 }],
    ]);
    expect(mockCodeToTokens).toHaveBeenCalledWith("echo hi", {
      lang: "bash",
      theme: "github-dark",
    });
  });

  it("falls back to plain lines on failure, defaulting the language", async () => {
    mockCodeToTokens.mockRejectedValue(new Error("no grammar"));
    const result = await highlightSnippetLines("echo <hi>", "");
    expect(result.lines).toEqual([[{ content: "echo <hi>" }]]);
    expect(mockCodeToTokens).toHaveBeenCalledWith("echo <hi>", {
      lang: "text",
      theme: "github-dark",
    });
  });
});

describe("SnippetView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows plain code first, then the highlighted tokens", async () => {
    let resolve!: (value: ReturnType<typeof tokensResult>) => void;
    mockCodeToTokens.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }) as never,
    );
    render(<SnippetView code="git status" language="bash" />);

    expect(screen.getByText("git status")).toBeInTheDocument();

    resolve(tokensResult(["highlighted"]));
    await waitFor(() =>
      expect(screen.getByText("highlighted")).toBeInTheDocument(),
    );
  });

  it("copies a single line when the line is clicked", async () => {
    const user = userEvent.setup();
    mockCodeToTokens.mockResolvedValue(
      tokensResult(["git status", "git push"]) as never,
    );
    render(<SnippetView code={"git status\ngit push"} language="bash" />);

    await waitFor(() =>
      expect(screen.getByText("git push")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Copy line 2" }));
    expect(clip).toHaveBeenCalledWith("git push");
    expect(toastClip).toHaveBeenCalledWith(true, "Line copied");
  });

  it("opens fill-in when the line has placeholders", async () => {
    const user = userEvent.setup();
    mockCodeToTokens.mockResolvedValue(
      tokensResult(["git push origin {{branch}}"]) as never,
    );
    render(
      <SnippetView
        code="git push origin {{branch}}"
        language="bash"
        title="Push"
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("git push origin {{branch}}")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Copy line 1" }));
    expect(clip).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Copy Push" })).toBeVisible();

    await user.type(screen.getByLabelText("branch"), "main");
    await user.click(screen.getByRole("button", { name: /^copy$/i }));
    expect(clip).toHaveBeenCalledWith("git push origin main");
    expect(toastClip).toHaveBeenCalledWith(true, "Line copied");
  });

  it("ignores a resolve that lands after unmount", async () => {
    let resolve!: (value: ReturnType<typeof tokensResult>) => void;
    mockCodeToTokens.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }) as never,
    );
    const { unmount } = render(<SnippetView code="x" language="bash" />);
    unmount();
    resolve(tokensResult(["late"]));
    await Promise.resolve();
  });
});
