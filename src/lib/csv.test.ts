import { describe, expect, it } from "vitest";

import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("splits rows and fields, handling quotes, CRLF, BOM and blank lines", () => {
    expect(
      parseCsv(
        '﻿date,note\r\n2026-11-01,"a, ""quoted""\nline"\r\n\r\n2026-11-02,x',
      ),
    ).toEqual([
      ["date", "note"],
      ["2026-11-01", 'a, "quoted"\nline'],
      ["2026-11-02", "x"],
    ]);
  });

  it("keeps empty fields and a final row without a newline", () => {
    expect(parseCsv("a,,c\n1,2,\n")).toEqual([
      ["a", "", "c"],
      ["1", "2", ""],
    ]);
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("solo")).toEqual([["solo"]]);
  });
});
