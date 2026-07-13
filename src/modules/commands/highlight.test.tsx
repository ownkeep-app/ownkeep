import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { codeToTokens } from "shiki";
import { writeClipboard } from "@/lib/clipboard";
import { toastClipboard } from "@/lib/toast";
import { highlightSnippetLines, splitCodeLines } from "./highlight-code";
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
      expect(
        screen.getByText("git push origin {{branch}}"),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Copy line 1" }));
    expect(clip).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Copy Push" })).toBeVisible();

    await user.type(screen.getByLabelText("branch"), "main");
    await user.click(screen.getByRole("button", { name: /^copy$/i }));
    expect(clip).toHaveBeenCalledWith("git push origin main");
    expect(toastClip).toHaveBeenCalledWith(true, "Line copied");
  });

  it("copies raw from the line fill-in and closes via Cancel / Close", async () => {
    const user = userEvent.setup();
    mockCodeToTokens.mockResolvedValue(tokensResult(["echo {{msg}}"]) as never);
    render(<SnippetView code="echo {{msg}}" language="bash" title="Echo" />);

    await waitFor(() =>
      expect(screen.getByText("echo {{msg}}")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Copy line 1" }));
    await user.click(screen.getByRole("button", { name: "Copy raw" }));
    expect(clip).toHaveBeenCalledWith("echo {{msg}}");

    clip.mockClear();
    await user.click(screen.getByRole("button", { name: "Copy line 1" }));
    const fillDialog = screen.getByRole("dialog", { name: "Copy Echo" });
    await user.click(
      within(fillDialog).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Copy Echo" }),
      ).not.toBeInTheDocument(),
    );
    expect(clip).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Copy line 1" }));
    await user.click(screen.getByRole("button", { name: "Close details" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Copy Echo" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("applies italic, bold, and underline token styles", async () => {
    mockCodeToTokens.mockResolvedValue({
      tokens: [
        [
          { content: "italic", offset: 0, color: "#fff", fontStyle: 1 },
          { content: "bold", offset: 6, color: "#fff", fontStyle: 2 },
          { content: "under", offset: 10, color: "#fff", fontStyle: 4 },
          { content: "plain", offset: 15, fontStyle: 0 },
        ],
      ],
      fg: "#e1e4e8",
      bg: "#24292e",
      themeName: "github-dark" as const,
    } as never);

    render(<SnippetView code="italicboldunderplain" language="typescript" />);
    await waitFor(() => expect(screen.getByText("italic")).toBeInTheDocument());

    expect(screen.getByText("italic")).toHaveStyle({ fontStyle: "italic" });
    expect(screen.getByText("bold")).toHaveStyle({ fontWeight: "bold" });
    expect(screen.getByText("under")).toHaveStyle({
      textDecoration: "underline",
    });
  });

  it("falls back when Shiki omits bg and fg colors", async () => {
    mockCodeToTokens.mockResolvedValue({
      tokens: [[{ content: "x", offset: 0, color: "#fff", fontStyle: 0 }]],
      fg: "",
      bg: "",
      themeName: "github-dark" as const,
    } as never);

    const result = await highlightSnippetLines("x", "bash");
    expect(result.bg).toBe("#24292e");
    expect(result.fg).toBe("#e1e4e8");
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
