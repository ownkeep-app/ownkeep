import { afterEach, describe, expect, it, vi } from "vitest";

import {
  compressImage,
  dataUrlToBlob,
  isPdf,
  MAX_PDF_BYTES,
  readAttachment,
} from "./attachment";

/** jsdom never decodes images; fake one that "loads" with the given natural size. */
function stubImage(width: number, height: number, fail = false) {
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = width;
      naturalHeight = height;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => (fail ? this.onerror?.() : this.onload?.()));
      }
    },
  );
}

function stubCanvas(context: Partial<CanvasRenderingContext2D> | null) {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toDataURL: vi.fn(() => "data:image/jpeg;base64,OUT"),
  };
  vi.spyOn(document, "createElement").mockReturnValueOnce(
    canvas as unknown as HTMLCanvasElement,
  );
  return canvas;
}

const file = new File(["png-bytes"], "report.png", { type: "image/png" });

describe("compressImage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("downscales the longest edge and re-encodes as JPEG on white", async () => {
    stubImage(4000, 3000);
    const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
    const canvas = stubCanvas(context);

    const image = await compressImage(file);

    expect(canvas.width).toBe(2000);
    expect(canvas.height).toBe(1500);
    expect(context.fillStyle).toBe("#ffffff");
    expect(context.drawImage).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      2000,
      1500,
    );
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.85);
    expect(image).toEqual({
      id: expect.any(String),
      name: "report.png",
      dataUrl: "data:image/jpeg;base64,OUT",
    });
  });

  it("never upscales small images", async () => {
    stubImage(640, 480);
    const canvas = stubCanvas({ fillRect: vi.fn(), drawImage: vi.fn() });
    await compressImage(file);
    expect([canvas.width, canvas.height]).toEqual([640, 480]);
  });

  it("rejects undecodable files and missing canvas support", async () => {
    stubImage(10, 10, true);
    await expect(compressImage(file)).rejects.toThrow(
      "Couldn't read that image.",
    );

    stubImage(10, 10);
    stubCanvas(null);
    await expect(compressImage(file)).rejects.toThrow(
      "Couldn't process that image.",
    );

    vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(
      function (this: FileReader) {
        this.onerror?.(new ProgressEvent("error") as ProgressEvent<FileReader>);
      },
    );
    await expect(compressImage(file)).rejects.toThrow(
      "Couldn't read that image.",
    );
  });
});

describe("readAttachment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps PDFs as uploaded, normalising a missing MIME type", async () => {
    const typed = await readAttachment(
      new File(["%PDF-1.7"], "血常规.pdf", { type: "application/pdf" }),
    );
    expect(typed.name).toBe("血常规.pdf");
    expect(isPdf(typed)).toBe(true);

    const untyped = await readAttachment(new File(["%PDF-1.7"], "LIVER.PDF"));
    expect(untyped.dataUrl).toMatch(/^data:application\/pdf;base64,/);
    expect(isPdf(untyped)).toBe(true);
    expect(await dataUrlToBlob(untyped.dataUrl).text()).toBe("%PDF-1.7");
  });

  it("rejects PDFs over the size limit and non-image, non-PDF files", async () => {
    const big = new File(["x"], "scan.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: MAX_PDF_BYTES + 1 });
    await expect(readAttachment(big)).rejects.toThrow(
      "“scan.pdf” is larger than 10 MB.",
    );
    await expect(
      readAttachment(new File(["a,b"], "data.csv", { type: "text/csv" })),
    ).rejects.toThrow("“data.csv” is not an image or PDF.");
  });

  it("compresses images", async () => {
    stubImage(100, 50);
    stubCanvas({ fillRect: vi.fn(), drawImage: vi.fn() });
    const photo = await readAttachment(
      new File(["png"], "a.png", { type: "image/png" }),
    );
    expect(photo.dataUrl).toBe("data:image/jpeg;base64,OUT");
    expect(isPdf(photo)).toBe(false);
  });

  it("decodes data URLs into typed blobs", () => {
    const blob = dataUrlToBlob("data:application/pdf;base64,JVBERg==");
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBe(4);
    expect(dataUrlToBlob("data:;base64,").type).toBe("");
  });
});
