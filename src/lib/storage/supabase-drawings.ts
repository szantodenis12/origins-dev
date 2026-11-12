import { randomBytes } from "node:crypto";
import {
  drawingFileSlug,
  isOriginalKey,
  ORIGINAL_EXTENSION,
  ORIGINAL_MIME,
  publicDrawingFileName,
} from "../drawing-image.ts";
import type { DrawingFileStore } from "./drawings.ts";

/**
 * Drawing photos in Supabase Storage, over plain `fetch` with the SERVICE
 * ROLE key. SERVER ONLY.
 *
 *   private bucket (default "desene-originale")  the untouched camera file.
 *     No public URL, no signed URL: the manager downloads it through
 *     /admin/desene/[id]/original, which reads it here with the service
 *     role and logs the download in the Jurnal.
 *   public bucket (default "desene-public")      gallery JPEG + cup mockup.
 *     Stored on the entry as the absolute public URL
 *     `<SUPABASE_URL>/storage/v1/object/public/<bucket>/<file>`; next.config
 *     allows that host in images.remotePatterns.
 *
 * Both buckets are created once by hand (or by tools/campaign-db-local.sh
 * locally): the private one with "Public bucket" OFF.
 */

export interface SupabaseDrawingFileStoreOptions {
  url: string;
  serviceRoleKey: string;
  privateBucket?: string;
  publicBucket?: string;
  /** Injected in tests. */
  fetch?: typeof fetch;
}

export const DEFAULT_PRIVATE_BUCKET = "desene-originale";
export const DEFAULT_PUBLIC_BUCKET = "desene-public";

function authHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: key };
  if (key.split(".").length === 3) headers.Authorization = `Bearer ${key}`;
  return headers;
}

const PUBLIC_MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png" };

export function createSupabaseDrawingFileStore(
  options: SupabaseDrawingFileStoreOptions,
): DrawingFileStore {
  if (typeof window !== "undefined") {
    throw new Error("The Supabase drawing file store is server-only.");
  }
  const root = options.url.replace(/\/+$/, "");
  const api = `${root}/storage/v1`;
  const privateBucket = options.privateBucket ?? DEFAULT_PRIVATE_BUCKET;
  const publicBucket = options.publicBucket ?? DEFAULT_PUBLIC_BUCKET;
  const publicPrefix = `${api}/object/public/${publicBucket}/`;
  const doFetch = options.fetch ?? fetch;
  const auth = authHeaders(options.serviceRoleKey);

  async function upload(bucket: string, name: string, bytes: Uint8Array, mime: string) {
    const response = await doFetch(`${api}/object/${bucket}/${name}`, {
      method: "POST",
      headers: { ...auth, "Content-Type": mime, "x-upsert": "false", "Cache-Control": "max-age=31536000" },
      body: bytes as BodyInit,
    });
    if (!response.ok) {
      throw new Error(
        `Supabase Storage upload ${bucket}/${name}: ${response.status} ${await response.text()}`,
      );
    }
  }

  async function removeFrom(bucket: string, names: string[]) {
    if (names.length === 0) return;
    const response = await doFetch(`${api}/object/${bucket}`, {
      method: "DELETE",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: names }),
    });
    // A missing file is not an error: the goal (gone) is reached.
    if (!response.ok && response.status !== 404) {
      throw new Error(`Supabase Storage delete ${bucket}: ${response.status} ${await response.text()}`);
    }
  }

  return {
    async saveOriginal({ bytes, type, code }) {
      const key = `${drawingFileSlug(code)}-${randomBytes(4).toString("hex")}.${ORIGINAL_EXTENSION[type]}`;
      const extension = ORIGINAL_EXTENSION[type];
      await upload(privateBucket, key, bytes, ORIGINAL_MIME[extension] ?? "application/octet-stream");
      return key;
    },

    async readOriginal(key) {
      // The shape check keeps a crafted key from reaching any other object.
      if (!isOriginalKey(key)) return null;
      const response = await doFetch(`${api}/object/authenticated/${privateBucket}/${key}`, {
        headers: auth,
        cache: "no-store",
      });
      if (!response.ok) return null;
      const extension = key.slice(key.lastIndexOf(".") + 1);
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        mime: ORIGINAL_MIME[extension] ?? "application/octet-stream",
        filename: key,
      };
    },

    async savePublic({ bytes, kind, code, extension: wanted }) {
      const prefix = kind === "web" ? "desen" : "pahar";
      const extension = kind === "web" ? "jpg" : (wanted ?? "jpg");
      const name = `${prefix}-${drawingFileSlug(code)}-${randomBytes(4).toString("hex")}.${extension}`;
      await upload(publicBucket, name, bytes, PUBLIC_MIME[extension]);
      return `${publicPrefix}${name}`;
    },

    async remove(refs) {
      const originals: string[] = [];
      const publics: string[] = [];
      for (const ref of refs) {
        if (!ref) continue;
        if (isOriginalKey(ref)) originals.push(ref);
        // Only URLs of OUR public bucket; a local path or a foreign host is ignored.
        else if (ref.startsWith(publicPrefix)) {
          const name = publicDrawingFileName(ref);
          if (name) publics.push(name);
        }
      }
      await Promise.all([removeFrom(privateBucket, originals), removeFrom(publicBucket, publics)]);
    },
  };
}
