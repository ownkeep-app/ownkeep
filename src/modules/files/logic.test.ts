import { describe, expect, it } from "vitest";

import { createDefaultModel } from "@/vault/model";
import {
  buildFileIndex,
  fileEntries,
  fileEntryFromImport,
  fileExtensionLabel,
  fileKind,
  partitionByValidity,
  fileSrc,
  filterFiles,
  formatBytes,
  formFromFile,
  isFileEntry,
  MAX_THUMBNAIL_SOURCE_BYTES,
  MAX_WHOLE_PREVIEW_BYTES,
  maxFileSizeBytes,
  maxFileSizeMb,
  parseMaxFileSizeMb,
  previewKind,
  sortFiles,
  thumbnailKind,
  totalBytes,
  updateFileEntry,
  validateFileInput,
} from "./logic";
import type { FileEntry } from "./types";

const file: FileEntry = {
  id: "blob-1",
  title: "Lab report",
  category: "Medical",
  invalid: false,
  description: "Annual checkup",
  date: "2026-07-01",
  fileName: "report.pdf",
  mime: "application/pdf",
  size: 2048,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

describe("file entries", () => {
  it("accepts only complete entries", () => {
    expect(isFileEntry(file)).toBe(true);
    expect(isFileEntry(null)).toBe(false);
    expect(isFileEntry("text")).toBe(false);
    expect(isFileEntry({ ...file, size: "2048" })).toBe(false);
    expect(fileEntries([file, { id: "x" }])).toEqual([file]);
  });

  it("reads files stored before the invalid field existed as valid", () => {
    const { invalid: _invalid, ...older } = file;
    expect(fileEntries([older])[0].invalid).toBe(false);
    expect(fileEntries([{ ...older, invalid: "yes" }])[0].invalid).toBe(false);
    expect(fileEntries([{ ...older, invalid: true }])[0].invalid).toBe(true);
  });

  it("keeps files stored before categories existed, in the default category", () => {
    const { category: _category, ...older } = file;
    for (const stored of [
      older,
      { ...older, category: "  " },
      { ...older, category: 7 },
    ]) {
      expect(fileEntries([stored])).toEqual([
        { ...older, category: "Personal" },
      ]);
    }
  });

  it("indexes title, description and file name", () => {
    expect(buildFileIndex([file])).toEqual([
      {
        id: "blob-1",
        moduleId: "files",
        type: "file",
        searchString: "Lab report Medical Annual checkup report.pdf",
        displayLine: "Lab report — report.pdf",
      },
    ]);
    expect(buildFileIndex([{ ...file, description: "" }])[0].searchString).toBe(
      "Lab report Medical report.pdf",
    );
  });
});

describe("previews", () => {
  it("classifies content types", () => {
    expect(fileKind("application/pdf")).toBe("pdf");
    expect(fileKind("image/png")).toBe("image");
    expect(fileKind("audio/mpeg")).toBe("audio");
    expect(fileKind("video/mp4")).toBe("video");
    expect(fileKind("application/octet-stream")).toBe("other");
  });

  it("previews every displayable kind but not opaque files", () => {
    expect(previewKind(file)).toBe("pdf");
    expect(previewKind({ mime: "image/png", size: 1 })).toBe("image");
    expect(previewKind({ mime: "audio/mpeg", size: 1 })).toBe("audio");
    expect(previewKind({ mime: "video/mp4", size: 1 })).toBe("video");
    expect(
      previewKind({ mime: "application/octet-stream", size: 1 }),
    ).toBeNull();
  });

  it("limits what must load whole, but not what seeks by range", () => {
    const size = MAX_WHOLE_PREVIEW_BYTES + 1;
    expect(previewKind({ mime: "application/pdf", size })).toBeNull();
    expect(previewKind({ mime: "image/png", size })).toBeNull();
    expect(previewKind({ mime: "video/mp4", size })).toBe("video");
    expect(previewKind({ mime: "audio/mpeg", size })).toBe("audio");
    expect(
      previewKind({ mime: "image/png", size: MAX_WHOLE_PREVIEW_BYTES }),
    ).toBe("image");
  });

  it("shows a tile picture for images, PDFs and video, within limits", () => {
    expect(thumbnailKind({ mime: "image/png", size: 1 })).toBe("image");
    expect(thumbnailKind({ mime: "application/pdf", size: 1 })).toBe("pdf");
    expect(thumbnailKind({ mime: "audio/mpeg", size: 1 })).toBeNull();
    expect(
      thumbnailKind({ mime: "application/octet-stream", size: 1 }),
    ).toBeNull();

    const atLimit = MAX_THUMBNAIL_SOURCE_BYTES;
    expect(thumbnailKind({ mime: "image/png", size: atLimit })).toBe("image");
    expect(thumbnailKind({ mime: "image/png", size: atLimit + 1 })).toBeNull();
    expect(
      thumbnailKind({ mime: "application/pdf", size: atLimit + 1 }),
    ).toBeNull();
    // Video reads only what it needs by range, whatever its size.
    expect(thumbnailKind({ mime: "video/mp4", size: 1e12 })).toBe("video");
  });

  it("builds the preview scheme URL", () => {
    expect(fileSrc({ id: "abc", mime: "image/svg+xml" })).toBe(
      "ownkeep-file://localhost/abc/image/svg+xml",
    );
  });
});

describe("fileExtensionLabel", () => {
  it.each([
    ["cert.pem", "PEM"],
    ["archive.tar.gz", "GZ"],
    ["PHOTO.Heic", "HEIC"],
    ["README", ""],
    [".env", ""],
    ["trailing.", ""],
  ])("labels %s as %j", (fileName, expected) => {
    expect(fileExtensionLabel(fileName)).toBe(expected);
  });
});

describe("partitionByValidity", () => {
  it("splits files apart, keeping their order", () => {
    const a = { ...file, id: "a" };
    const b = { ...file, id: "b", invalid: true };
    const c = { ...file, id: "c" };
    const d = { ...file, id: "d", invalid: true };
    expect(partitionByValidity([a, b, c, d])).toEqual({
      valid: [a, c],
      invalid: [b, d],
    });
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [1023, "1023 B"],
    [1024, "1.0 KB"],
    [1536, "1.5 KB"],
    [150 * 1024, "150 KB"],
    [5 * 1024 ** 2, "5.0 MB"],
    [1.5 * 1024 ** 3, "1.5 GB"],
    [2 * 1024 ** 4, "2.0 TB"],
    [5000 * 1024 ** 4, "5000 TB"],
  ])("formats %d as %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe("listing", () => {
  const older = {
    ...file,
    id: "old",
    title: "Zebra",
    description: "",
    date: "2020-01-01",
  };
  const sameDay = { ...file, id: "same", title: "Apple" };

  it("sorts newest first, then by title, without mutating", () => {
    const input = [older, file, sameDay];
    expect(sortFiles(input).map((item) => item.id)).toEqual([
      "same",
      "blob-1",
      "old",
    ]);
    expect(input[0]).toBe(older);
  });

  it("filters on title, description and file name", () => {
    expect(filterFiles([file, older], "  ")).toHaveLength(2);
    expect(filterFiles([file, older], "CHECKUP")).toEqual([file]);
    expect(filterFiles([file, older], "report.pdf")).toHaveLength(2);
    expect(filterFiles([file, older], "zebra")).toEqual([older]);
    expect(filterFiles([file, older], "nothing")).toEqual([]);
  });

  it("filters by category, alone and with a query", () => {
    const work = { ...older, category: "Work" };
    expect(filterFiles([file, work], "", "Work")).toEqual([work]);
    expect(filterFiles([file, work], "", "Medical")).toEqual([file]);
    expect(filterFiles([file, work], "zebra", "Medical")).toEqual([]);
    expect(filterFiles([file, work], "medical")).toEqual([file]);
    expect(filterFiles([file, work], "", "")).toHaveLength(2);
  });

  it("totals sizes", () => {
    expect(totalBytes([])).toBe(0);
    expect(totalBytes([file, older])).toBe(4096);
  });
});

describe("importing and editing", () => {
  const now = new Date(2026, 6, 8, 12);
  const imported = {
    id: "blob-2",
    fileName: "holiday.final.MP4",
    mime: "video/mp4",
    size: 99,
    modifiedMs: new Date(2019, 3, 2, 12).getTime(),
  };

  it("starts from the file's own name and modified date", () => {
    expect(fileEntryFromImport(imported, now, "Work")).toEqual({
      id: "blob-2",
      title: "holiday.final",
      category: "Work",
      invalid: false,
      description: "",
      date: "2019-04-02",
      fileName: "holiday.final.MP4",
      mime: "video/mp4",
      size: 99,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });

  it("falls back to today when the OS gives no modified date", () => {
    expect(
      fileEntryFromImport({ ...imported, modifiedMs: null }, now, "Work").date,
    ).toBe("2026-07-08");
  });

  it("keeps a whole name when there is no extension to strip", () => {
    const title = (fileName: string) =>
      fileEntryFromImport({ ...imported, fileName }, now, "Work").title;
    expect(title("README")).toBe("README");
    expect(title(".env")).toBe(".env");
  });

  it("edits only the user's fields", () => {
    const form = formFromFile(file);
    expect(form).toEqual({
      title: "Lab report",
      category: "Medical",
      invalid: false,
      description: "Annual checkup",
      date: "2026-07-01",
    });
    const updated = updateFileEntry(
      file,
      {
        title: "  New  ",
        category: " Work ",
        invalid: true,
        description: " kept ",
        date: "2026-08-01",
      },
      "2026-08-02T00:00:00.000Z",
    );
    expect(updated).toEqual({
      ...file,
      title: "New",
      category: "Work",
      invalid: true,
      description: " kept ",
      date: "2026-08-01",
      updatedAt: "2026-08-02T00:00:00.000Z",
    });
  });

  it("requires a title, category and date", () => {
    const input = formFromFile(file);
    expect(validateFileInput(input)).toBeNull();
    expect(validateFileInput({ ...input, title: " " })).toBe(
      "Title is required.",
    );
    expect(validateFileInput({ ...input, category: " " })).toBe(
      "Category is required.",
    );
    expect(validateFileInput({ ...input, date: "" })).toBe("Date is required.");
  });
});

describe("size limit setting", () => {
  function settingsWith(value: unknown) {
    const { settings } = createDefaultModel("2026-07-08T00:00:00.000Z");
    return {
      ...settings,
      modules: {
        ...settings.modules,
        files: { enabled: true, maxFileSizeMb: value },
      },
    };
  }

  it("defaults to no limit and ignores nonsense", () => {
    const { settings } = createDefaultModel("2026-07-08T00:00:00.000Z");
    expect(maxFileSizeMb(settings)).toBe(0);
    for (const bad of ["5", -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(maxFileSizeMb(settingsWith(bad))).toBe(0);
    }
  });

  it("converts a stored limit to bytes", () => {
    expect(maxFileSizeMb(settingsWith(3))).toBe(3);
    expect(maxFileSizeBytes(settingsWith(3))).toBe(3 * 1024 * 1024);
  });

  it("parses the settings field", () => {
    expect(parseMaxFileSizeMb(" 100 ")).toBe(100);
    expect(parseMaxFileSizeMb("0")).toBe(0);
    expect(parseMaxFileSizeMb("")).toBe(0);
    expect(parseMaxFileSizeMb("1.5")).toBeNull();
    expect(parseMaxFileSizeMb("-1")).toBeNull();
    expect(parseMaxFileSizeMb("lots")).toBeNull();
  });
});
