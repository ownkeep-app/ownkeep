import { describe, expect, it } from "vitest";

import {
  applyMarkdownAction,
  prefixLines,
  wrapSelection,
} from "./markdown-format";

describe("markdown-format", () => {
  it("wraps the selection and inserts a placeholder when empty", () => {
    expect(wrapSelection("hello world", 0, 5, "**", "**")).toEqual({
      value: "**hello** world",
      selectionStart: 2,
      selectionEnd: 7,
    });
    expect(wrapSelection("", 0, 0, "**", "**", "bold")).toEqual({
      value: "**bold**",
      selectionStart: 2,
      selectionEnd: 6,
    });
  });

  it("prefixes selected lines for headings and lists", () => {
    expect(prefixLines("one\ntwo", 0, 7, "- ")).toEqual({
      value: "- one\n- two",
      selectionStart: 0,
      selectionEnd: 11,
    });
    expect(prefixLines("- already", 0, 9, "- ")).toEqual({
      value: "- already",
      selectionStart: 0,
      selectionEnd: 9,
    });
  });

  it("applies toolbar actions", () => {
    expect(applyMarkdownAction("text", 0, 4, "bold").value).toBe("**text**");
    expect(applyMarkdownAction("text", 0, 4, "italic").value).toBe("*text*");
    expect(applyMarkdownAction("text", 0, 4, "strikethrough").value).toBe(
      "~~text~~",
    );
    expect(applyMarkdownAction("text", 0, 4, "code").value).toBe("`text`");
    expect(applyMarkdownAction("text", 0, 4, "link").value).toBe(
      "[text](url)",
    );
    expect(applyMarkdownAction("line", 0, 4, "heading1").value).toBe("# line");
    expect(applyMarkdownAction("line", 0, 4, "heading2").value).toBe("## line");
    expect(applyMarkdownAction("line", 0, 4, "heading3").value).toBe(
      "### line",
    );
    expect(applyMarkdownAction("line", 0, 4, "list").value).toBe("- line");
    expect(applyMarkdownAction("line", 0, 4, "quote").value).toBe("> line");
    expect(applyMarkdownAction("x", 0, 1, "codeBlock").value).toBe(
      "```\nx\n```",
    );
  });
});
