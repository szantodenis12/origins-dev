import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  drawingFileSlug,
  isOriginalKey,
  isPublicDrawingPath,
  ORIGINAL_EXTENSION,
  ORIGINAL_MIME,
  type SniffedImage,
} from "../drawing-image";
import { UPLOAD_URL_PREFIX } from "../images";
import { createSupabaseDrawingFileStore } from "./supabase-drawings";

/**
 * Where the drawing photos live. A port of its own next to `ImageStore`
 * because one of the three files must NOT be public: the untouched camera
 * file can show the table, a hand, the back of the sheet. Only the cropped
 * web version and the cup mockup get a public URL.
 *
 * Local adapter (this file): originals under `.data/desene/originale/`,
 * outside `public/` and out of git; public files in `public/photos/uploads/`
 * next to the menu photos. Works in dev and on a server with a persistent
 * disk, not on Vercel. Supabase adapter (./supabase-drawings.ts): a PRIVATE
 * bucket for originals (read back with the service role, served only by
 * the manager route /admin/desene/[id]/original, never a public or signed
 * URL) and a public bucket for the web JPEG + cup mockup. Picked by the
 * same env as the campaign Db (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY);
 * in production without it every call fails closed.
 */

export interface DrawingFileStore {
  /** Private. Returns the key to keep on the entry. */
  saveOriginal(input: {
    bytes: Uint8Array;
    type: SniffedImage;
    code: string;
  }): Promise<string>;
  readOriginal(
    key: string,
  ): Promise<{ bytes: Uint8Array; mime: string; filename: string } | null>;
  /** Public. `web` is the gallery JPEG, `cup` the mockup (JPEG or PNG). Returns the URL path. */
  savePublic(input: {
    bytes: Uint8Array;
    kind: "web" | "cup";
    code: string;
    /** Only for `cup`; the gallery version is always a JPEG. */
    extension?: "jpg" | "png";
  }): Promise<string>;
  /** Original keys and public paths alike; unknown or foreign values are ignored. */
  remove(refs: (string | null)[]): Promise<void>;
}

const ORIGINALS_DIR = path.join(process.cwd(), ".data", "desene", "originale");
const PUBLIC_DIR = path.join(process.cwd(), "public", "photos", "uploads");

function createLocalDrawingFileStore(): DrawingFileStore {
  return {
    async saveOriginal({ bytes, type, code }) {
      const key = `${drawingFileSlug(code)}-${randomBytes(4).toString("hex")}.${ORIGINAL_EXTENSION[type]}`;
      await mkdir(ORIGINALS_DIR, { recursive: true });
      await writeFile(path.join(ORIGINALS_DIR, key), bytes);
      return key;
    },

    async readOriginal(key) {
      // The shape check is what keeps a crafted key inside the folder.
      if (!isOriginalKey(key)) return null;
      try {
        const bytes = await readFile(path.join(ORIGINALS_DIR, key));
        const extension = key.slice(key.lastIndexOf(".") + 1);
        return {
          bytes: new Uint8Array(bytes),
          mime: ORIGINAL_MIME[extension] ?? "application/octet-stream",
          filename: key,
        };
      } catch {
        return null;
      }
    },

    async savePublic({ bytes, kind, code, extension: wanted }) {
      const prefix = kind === "web" ? "desen" : "pahar";
      const extension = kind === "web" ? "jpg" : (wanted ?? "jpg");
      const name = `${prefix}-${drawingFileSlug(code)}-${randomBytes(4).toString("hex")}.${extension}`;
      await mkdir(PUBLIC_DIR, { recursive: true });
      await writeFile(path.join(PUBLIC_DIR, name), bytes);
      return `${UPLOAD_URL_PREFIX}${name}`;
    },

    async remove(refs) {
      await Promise.all(
        refs.map(async (ref) => {
          if (!ref) return;
          const file = isOriginalKey(ref)
            ? path.join(ORIGINALS_DIR, ref)
            : isPublicDrawingPath(ref)
              ? path.join(PUBLIC_DIR, ref.slice(UPLOAD_URL_PREFIX.length))
              : null;
          if (file) await unlink(file).catch(() => {});
        }),
      );
    },
  };
}

export class DrawingFileStoreUnavailableError extends Error {
  constructor(reason: string) {
    super(
      `Stocarea fotografiilor din concurs nu este configurată: ${reason} / ` +
        "Drawing file store not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
    this.name = "DrawingFileStoreUnavailableError";
  }
}

function createUnavailableDrawingFileStore(reason: string): DrawingFileStore {
  const fail = async (): Promise<never> => {
    throw new DrawingFileStoreUnavailableError(reason);
  };
  return { saveOriginal: fail, readOriginal: fail, savePublic: fail, remove: fail };
}

/** Same rule as lib/db/compose.ts `campaignBackend`. */
export function createDrawingFileStore(env: Record<string, string | undefined>): DrawingFileStore {
  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && key) {
    return createSupabaseDrawingFileStore({
      url,
      serviceRoleKey: key,
      privateBucket: env.SUPABASE_DRAWINGS_PRIVATE_BUCKET?.trim() || undefined,
      publicBucket: env.SUPABASE_DRAWINGS_PUBLIC_BUCKET?.trim() || undefined,
    });
  }
  if (url || key || env.NODE_ENV === "production") {
    return createUnavailableDrawingFileStore(
      url || key
        ? "SUPABASE_URL și SUPABASE_SERVICE_ROLE_KEY trebuie setate împreună."
        : "pe Vercel discul local nu se păstrează.",
    );
  }
  return createLocalDrawingFileStore();
}

let store: DrawingFileStore | null = null;

/** The one place the drawing file adapter is chosen. */
export function getDrawingFileStore(): DrawingFileStore {
  store ??= createDrawingFileStore(process.env);
  return store;
}
