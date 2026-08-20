import { randomBytes } from "node:crypto";
import {
  MAX_IMAGE_BYTES,
  UPLOAD_URL_PREFIX,
  isPhotoPath,
  uploadFilename,
} from "../images.ts";
import type {
  ImageStore,
  SaveImageInput,
  SaveImageResult,
  StoredImage,
} from "./index.ts";
import { supabaseClient } from "../db/supabase-client.ts";

const BUCKET_NAME = "origins-photos";

export function createSupabaseImageStore(): ImageStore {
  const client = supabaseClient;

  return {
    async list(): Promise<StoredImage[]> {
      if (!client) return [];

      const { data, error } = await client.storage
        .from(BUCKET_NAME)
        .list("uploads", { sortBy: { column: "created_at", order: "desc" } });

      if (error || !data) return [];

      return data.map((file) => {
        const publicUrl = client.storage
          .from(BUCKET_NAME)
          .getPublicUrl(`uploads/${file.name}`).data.publicUrl;

        return {
          path: publicUrl,
          uploadedAt: file.created_at ? new Date(file.created_at).getTime() : Date.now(),
        };
      });
    },

    async save(input: SaveImageInput): Promise<SaveImageResult> {
      if (!client) {
        throw new Error("Supabase client is not initialized.");
      }

      if (input.bytes.byteLength > MAX_IMAGE_BYTES) {
        return { status: "too_large" };
      }

      const filename = uploadFilename(
        input.filename,
        input.mime,
        randomBytes(4).toString("hex"),
      );

      if (!filename) return { status: "unsupported_type" };

      const filePath = `uploads/${filename}`;

      const { error } = await client.storage
        .from(BUCKET_NAME)
        .upload(filePath, input.bytes, {
          contentType: input.mime,
          upsert: true,
        });

      if (error) {
        throw new Error(`Failed to upload photo to Supabase storage: ${error.message}`);
      }

      const publicUrl = client.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath).data.publicUrl;

      return { status: "saved", path: publicUrl };
    },

    async has(photoPath: string): Promise<boolean> {
      if (!photoPath) return false;
      if (photoPath.startsWith("http://") || photoPath.startsWith("https://")) {
        return true;
      }
      return isPhotoPath(photoPath);
    },
  };
}
