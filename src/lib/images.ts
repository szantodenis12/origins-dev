/**
 * Rules for menu photos, kept free of `fs` and of React so both the upload
 * route and the tests can import them. The storage adapter (lib/storage) does
 * the writing; this file only decides what is allowed to be written and what a
 * stored photo may look like coming back from a form.
 */

/** Phone cameras produce 3-5 MB files; 8 MB leaves room without inviting RAWs. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Everything next/image handles well and every phone can produce. */
const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const ACCEPTED_IMAGE_MIMES = Object.keys(EXTENSION_BY_MIME);

/** What the file input offers; the server re-checks the real type anyway. */
export const IMAGE_ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_MIMES.join(",");

/** Public folder the library reads and uploads are written under. */
export const PHOTO_URL_PREFIX = "/photos/";
/** Uploaded files live in their own subfolder: seed photos stay recognisable. */
export const UPLOAD_URL_PREFIX = "/photos/uploads/";

/** Only the shapes this app itself produces. Anything else is rejected. */
const PHOTO_PATH = /^\/photos\/(uploads\/)?[a-z0-9][a-z0-9-]*\.(webp|jpg|jpeg|png)$/;

export function imageExtension(mime: string): string | null {
  return EXTENSION_BY_MIME[mime] ?? null;
}

/** "Cafea de vară.JPG" -> "cafea-de-vara". Empty when nothing survives. */
export function photoSlug(filename: string): string {
  return filename
    .replace(/\.[^.]*$/, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48)
    .replace(/-$/, "");
}

/**
 * Name of the file to write. `token` comes from the caller (random hex) so the
 * same photo uploaded twice never overwrites the older one — a manager who
 * swaps a picture back must still find the previous version in the library.
 */
export function uploadFilename(
  originalName: string,
  mime: string,
  token: string,
): string | null {
  const extension = imageExtension(mime);
  if (!extension) return null;

  const base = photoSlug(originalName) || "poza";
  return `${base}-${token}.${extension}`;
}

/**
 * Guard for the value a form sends back in the photo field. The form carries a
 * plain string, so without this a manager (or anyone POSTing to the action)
 * could point a product at an arbitrary URL. Existence in the library is
 * checked separately, by the caller that has the storage adapter.
 */
export function isPhotoPath(value: string): boolean {
  return PHOTO_PATH.test(value);
}

/** "/photos/uploads/latte-9f3a1c2b.webp" -> "latte" (what the picker shows). */
export function photoLabel(path: string): string {
  const file = path.slice(path.lastIndexOf("/") + 1).replace(/\.[^.]*$/, "");
  return file.replace(/-[0-9a-f]{8}$/, "");
}
