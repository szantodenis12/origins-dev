/**
 * Ports and adapters again, same reasoning as `lib/db`: the menu editor talks
 * to `ImageStore`, never to a filesystem or a bucket.
 *
 * The local adapter writes into `public/photos/uploads`, which works in dev and
 * on a server with a persistent disk. It does NOT survive a Vercel deploy —
 * `public/` is baked at build time there, so an uploaded file disappears on the
 * next deploy, exactly like the in-memory database it ships next to. Phase 3
 * replaces both at once: `supabase.ts` here (Storage bucket, public URLs) and
 * `db/supabase.ts` next door. When that lands, add the bucket host to
 * `images.remotePatterns` in next.config.ts — the photo paths stop being local.
 */

export interface StoredImage {
  /** Public URL used as the `photo` value on products/categories/locations. */
  path: string;
  /** Millisecond timestamp, newest first in `list()`. */
  uploadedAt: number;
}

export interface SaveImageInput {
  bytes: Uint8Array;
  /** Name as it left the manager's phone; only used to build a readable slug. */
  filename: string;
  mime: string;
}

export type SaveImageResult =
  | { status: "saved"; path: string }
  | { status: "unsupported_type" }
  | { status: "too_large" };

export interface ImageStore {
  /** Everything the picker may offer, newest upload first. */
  list(): Promise<StoredImage[]>;
  save(input: SaveImageInput): Promise<SaveImageResult>;
  /** True when the path is a real file in this store — form input is untrusted. */
  has(path: string): Promise<boolean>;
}

import { createLocalImageStore } from "./local.ts";
import { createSupabaseImageStore } from "./supabase.ts";

let store: ImageStore | null = null;

/** The one place the image adapter is chosen. */
export function getImageStore(): ImageStore {
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("YOUR_PROJECT_ID")
  ) {
    store ??= createSupabaseImageStore();
  } else {
    store ??= createLocalImageStore();
  }
  return store;
}
