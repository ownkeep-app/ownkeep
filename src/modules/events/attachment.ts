import type { EventAttachment } from "./types";

const PDF_MIME = "application/pdf";
const PDF_DATA_URL_PREFIX = `data:${PDF_MIME};`;
/** PDFs are stored as uploaded (no re-encoding), and the whole vault is rewritten on each save. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

/**
 * Longest edge kept for stored photos. Large enough to read a lab report when zoomed in, small
 * enough that the whole vault — re-encrypted and rewritten on every save — stays light.
 */
const MAX_IMAGE_EDGE = 2000;
const JPEG_QUALITY = 0.85;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Couldn't read that image."));
    image.src = src;
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read that image."));
    reader.readAsDataURL(file);
  });
}

/** Downscale + re-encode an image file as a JPEG data URL for inline vault storage. */
export async function compressImage(file: File): Promise<EventAttachment> {
  const image = await loadImage(await readAsDataUrl(file));
  const scale = Math.min(
    1,
    MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Couldn't process that image.");
  // JPEG has no alpha; paint white first so transparent PNG screenshots stay legible.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    id: crypto.randomUUID(),
    name: file.name,
    dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY),
  };
}

export function isPdf(attachment: EventAttachment): boolean {
  return attachment.dataUrl.startsWith(PDF_DATA_URL_PREFIX);
}

function isPdfFile(file: File): boolean {
  return file.type === PDF_MIME || file.name.toLowerCase().endsWith(".pdf");
}

async function readPdf(file: File): Promise<EventAttachment> {
  if (file.size > MAX_PDF_BYTES) {
    throw new Error(`“${file.name}” is larger than 10 MB.`);
  }
  // Some pickers report no MIME type; normalise so `isPdf` can recognise the stored file.
  const dataUrl = (await readAsDataUrl(file)).replace(
    /^data:[^;]*;/,
    PDF_DATA_URL_PREFIX,
  );
  return { id: crypto.randomUUID(), name: file.name, dataUrl };
}

/** Turn an uploaded file into an attachment: photos are compressed, PDFs kept as-is. */
export function readAttachment(file: File): Promise<EventAttachment> {
  if (isPdfFile(file)) return readPdf(file);
  if (file.type.startsWith("image/")) return compressImage(file);
  return Promise.reject(new Error(`“${file.name}” is not an image or PDF.`));
}

/** Decode a base64 data URL without `fetch` (the CSP's connect-src does not allow `data:`). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",", 2);
  const mime = /^data:([^;]+)/.exec(header)?.[1] ?? "";
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}
