/**
 * Rules for the drawing photos staff upload, free of `fs` and React so the
 * upload route and the tests share them. Three files per drawing:
 *
 *   original   the untouched camera file, PRIVATE (cup supplier, 04.12)
 *   web        JPEG, longest side <= 1600 px, rotated and cropped on the
 *              phone before upload: what the gallery shows
 *   cup        mockup of the drawing on the cup (JPEG, or PNG), optional;
 *              only for drawings with reproduction consent
 *
 * The browser does the resizing; nothing here trusts it. The server sniffs
 * the real type from the bytes and reads the real size from the JPEG
 * header, so a 6000 px file renamed "web" is refused.
 */

export const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
export const MAX_WEB_BYTES = 3 * 1024 * 1024;
export const MAX_CUP_BYTES = 4 * 1024 * 1024;
export const WEB_MAX_SIDE = 1600;

export type SniffedImage = "jpeg" | "png" | "webp" | "heic";

/** The type the bytes really are; the browser's `file.type` is only a claim. */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  // ISO base media: "ftyp" + brand. iPhones hand over HEIC from the camera.
  if (ascii(4, 8) === "ftyp" && /^(heic|heix|heif|mif1|msf1|hevc)$/.test(ascii(8, 12))) {
    return "heic";
  }
  return null;
}

export const ORIGINAL_EXTENSION: Record<SniffedImage, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  heic: "heic",
};

export const ORIGINAL_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

/** Width and height from the JPEG frame header; null when there is none. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (sniffImage(bytes) !== "jpeg") return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    // Fill bytes and standalone markers carry no length.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    // SOF0..SOF15, minus DHT (C4), JPG (C8) and DAC (CC).
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

/** Width and height from the PNG IHDR chunk. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (sniffImage(bytes) !== "png" || bytes.length < 24) return null;
  const read = (at: number) =>
    ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
  const width = read(16);
  const height = read(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

export type WebImageCheck =
  | { ok: true; width: number; height: number }
  | { ok: false; reason: "type" | "too_large" | "dimensions" };

/** The gallery version: a real JPEG, under the byte cap, <= 1600 px a side. */
export function checkWebImage(bytes: Uint8Array): WebImageCheck {
  if (bytes.byteLength > MAX_WEB_BYTES) return { ok: false, reason: "too_large" };
  const size = jpegSize(bytes);
  if (!size) return { ok: false, reason: "type" };
  if (size.width > WEB_MAX_SIDE || size.height > WEB_MAX_SIDE) {
    return { ok: false, reason: "dimensions" };
  }
  return { ok: true, ...size };
}

/** Scale a width x height so the longest side is at most `max`. Never upscales. */
export function fitWithin(
  width: number,
  height: number,
  max: number = WEB_MAX_SIDE,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** "R-012" -> "r-012": the code as it appears in a file name. */
export function drawingFileSlug(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9-]/g, "");
}

/**
 * Public files this app itself writes for drawings. Form input is untrusted.
 * Two shapes, one file name rule:
 *   local     /photos/uploads/desen-r-001-1a2b3c4d.jpg
 *   Supabase  https://<project>.supabase.co/storage/v1/object/public/<bucket>/desen-r-001-1a2b3c4d.jpg
 * (lib/storage/drawings.ts picks the adapter; each adapter also checks that
 * a URL points at ITS OWN bucket before deleting anything.)
 */
const PUBLIC_DRAWING_FILE = /^(desen|pahar)-[rep]-\d{3}-[0-9a-f]{8}\.(jpg|png)$/;
const LOCAL_PUBLIC_PREFIX = "/photos/uploads/";
const STORAGE_PUBLIC_URL =
  /^https?:\/\/[a-z0-9.-]+(?::\d{1,5})?\/storage\/v1\/object\/public\/[a-z0-9][a-z0-9_-]{0,62}\/([^/?#]+)$/i;
const ORIGINAL_KEY = /^[rep]-\d{3}-[0-9a-f]{8}\.(jpg|png|webp|heic)$/;

/** The bare file name of a public drawing path or URL; null for anything else. */
export function publicDrawingFileName(value: string): string | null {
  const name = value.startsWith(LOCAL_PUBLIC_PREFIX)
    ? value.slice(LOCAL_PUBLIC_PREFIX.length)
    : (STORAGE_PUBLIC_URL.exec(value)?.[1] ?? null);
  return name !== null && PUBLIC_DRAWING_FILE.test(name) ? name : null;
}

export function isPublicDrawingPath(value: string): boolean {
  return publicDrawingFileName(value) !== null;
}

export function isOriginalKey(value: string): boolean {
  return ORIGINAL_KEY.test(value);
}
