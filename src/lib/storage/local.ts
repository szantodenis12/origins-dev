import { randomBytes } from "node:crypto";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  MAX_IMAGE_BYTES,
  PHOTO_URL_PREFIX,
  UPLOAD_URL_PREFIX,
  isPhotoPath,
  uploadFilename,
} from "../images";
import type {
  ImageStore,
  SaveImageInput,
  SaveImageResult,
  StoredImage,
} from "./index";

/**
 * Filesystem adapter: `public/photos` is the library, `public/photos/uploads`
 * is what the manager adds. See the note in `./index.ts` about deploys.
 */

const PHOTOS_DIR = path.join(process.cwd(), "public", "photos");
const UPLOADS_DIR = path.join(PHOTOS_DIR, "uploads");

const IMAGE_FILE = /\.(webp|jpe?g|png)$/i;

async function readDirectory(
  directory: string,
  urlPrefix: string,
): Promise<StoredImage[]> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    // No uploads yet — an empty library is a normal state, not an error.
    return [];
  }

  const files = names.filter((name) => IMAGE_FILE.test(name));
  return Promise.all(
    files.map(async (name) => ({
      path: `${urlPrefix}${name}`,
      uploadedAt: await stat(path.join(directory, name))
        .then((info) => info.mtimeMs)
        .catch(() => 0),
    })),
  );
}

export function createLocalImageStore(): ImageStore {
  return {
    async list(): Promise<StoredImage[]> {
      const [seeded, uploaded] = await Promise.all([
        readDirectory(PHOTOS_DIR, PHOTO_URL_PREFIX),
        readDirectory(UPLOADS_DIR, UPLOAD_URL_PREFIX),
      ]);

      // Newest first so the photo just uploaded is the first one in the picker.
      return [...uploaded, ...seeded].sort((a, b) => b.uploadedAt - a.uploadedAt);
    },

    async save(input: SaveImageInput): Promise<SaveImageResult> {
      if (input.bytes.byteLength > MAX_IMAGE_BYTES) {
        return { status: "too_large" };
      }
      const filename = uploadFilename(
        input.filename,
        input.mime,
        randomBytes(4).toString("hex"),
      );
      if (!filename) return { status: "unsupported_type" };

      await mkdir(UPLOADS_DIR, { recursive: true });
      await writeFile(path.join(UPLOADS_DIR, filename), input.bytes);

      return { status: "saved", path: `${UPLOAD_URL_PREFIX}${filename}` };
    },

    async has(photoPath: string): Promise<boolean> {
      // The shape check comes first: it is what keeps a crafted value from
      // walking out of the photos folder before it ever reaches the disk.
      if (!isPhotoPath(photoPath)) return false;

      const file = path.join(
        process.cwd(),
        "public",
        ...photoPath.slice(1).split("/"),
      );
      return stat(file)
        .then((info) => info.isFile())
        .catch(() => false);
    },
  };
}
