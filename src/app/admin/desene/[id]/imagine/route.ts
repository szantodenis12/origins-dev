import { revalidatePath } from "next/cache";
import {
  accessMayTouch,
  readDrawingAccess,
  recordDrawingAudit,
} from "@/lib/admin/drawing-access";
import { getDb } from "@/lib/db";
import { contestLocation } from "@/lib/drawing";
import {
  checkWebImage,
  jpegSize,
  MAX_CUP_BYTES,
  MAX_ORIGINAL_BYTES,
  pngSize,
  sniffImage,
} from "@/lib/drawing-image";
import { getDrawingFileStore } from "@/lib/storage/drawings";
import { publishRefusal, type PhaseRefusal } from "@/lib/campaign-guards";
import { campaignMoment, recordServerEvent } from "@/lib/campaign-server";

/** Why a photo was saved but not put online: the calendar. */
const PHASE_BLOCK_TEXT: Record<PhaseRefusal, string> = {
  not_open: "galeria se deschide pe 16.11.2026",
  closed: "votul s-a încheiat, nu se mai publică desene noi",
};

/**
 * The photo of a drawing, straight from the staff phone. One multipart POST
 * with up to three files:
 *
 *   original  the untouched camera file (kept private, for the supplier)
 *   web       the rotated + cropped JPEG, <= 1600 px (the gallery version)
 *   pahar     the cup mockup, JPEG or PNG, optional (lib/drawing-cup.ts)
 *
 * plus `publica=1` to put the drawing online in the same step. A Route
 * Handler rather than a Server Function: a camera original is bigger than
 * the 9 MB action body limit in next.config.ts.
 *
 * Everything is re-checked here: the session, the café, the real file
 * types and the real pixel size. The answer is JSON for the client screen.
 */

/** Staff screen: Romanian only. */
const strings = {
  noSession: "Sesiunea a expirat. Intră din nou în tură.",
  missing: "Desenul nu mai există. Reîncarcă pagina.",
  otherLocation: "Desenul e înscris la altă cafenea.",
  noFile: "Lipsește fotografia. Fă poza din nou.",
  badOriginal: "Fișierul nu e o fotografie (JPG, PNG, WEBP sau HEIC).",
  originalTooLarge: "Fotografia are peste 15 MB. Fă poza din nou, la calitate normală.",
  badWeb: "Versiunea pentru galerie nu e validă. Reîncarcă pagina și încearcă din nou.",
  saved: (code: string) => `${code}: fotografia a fost salvată.`,
  published: (code: string) => `${code}: fotografia a fost salvată și desenul e online.`,
  savedNotPublished: (code: string, why: string) =>
    `${code}: fotografia a fost salvată, dar desenul nu a fost publicat. ${why}`,
};

const BLOCK_TEXT = {
  no_consent: "Părintele nu a dat acordul pentru galeria online.",
  bad_status: "Marchează întâi desenul ca depus.",
  no_image: "Lipsește fotografia.",
};

function json(body: { ok: boolean; text: string }, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function fileBytes(value: FormDataEntryValue | null, max: number) {
  if (!(value instanceof File) || value.size === 0) return null;
  // Cheap check before pulling megabytes into memory.
  if (value.size > max) return "too_large" as const;
  return new Uint8Array(await value.arrayBuffer());
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await readDrawingAccess();
  if (!session) return json({ ok: false, text: strings.noSession }, 401);

  const db = getDb();
  const entry = await db.getDrawingEntry((await params).id);
  if (!entry) return json({ ok: false, text: strings.missing }, 404);

  // A barista works on the drawings of their own café, like the list.
  if (!accessMayTouch(session, entry.location)) {
    return json({ ok: false, text: strings.otherLocation }, 403);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, text: strings.noFile }, 400);
  }

  const original = await fileBytes(form.get("original"), MAX_ORIGINAL_BYTES);
  if (original === null) return json({ ok: false, text: strings.noFile }, 400);
  if (original === "too_large") {
    return json({ ok: false, text: strings.originalTooLarge }, 413);
  }
  const originalType = sniffImage(original);
  if (!originalType) return json({ ok: false, text: strings.badOriginal }, 415);

  const web = await fileBytes(form.get("web"), MAX_ORIGINAL_BYTES);
  if (web === null || web === "too_large") {
    return json({ ok: false, text: strings.badWeb }, 400);
  }
  const webCheck = checkWebImage(web);
  if (!webCheck.ok) return json({ ok: false, text: strings.badWeb }, 400);

  // The mockup is a nice-to-have: a bad one is dropped, not an error.
  const cupRaw = await fileBytes(form.get("pahar"), MAX_CUP_BYTES);
  // It is also only kept for a drawing that may be printed: without
  // reproduction consent a drawing is never shown on a cup, mockup included.
  const cupBytes =
    cupRaw instanceof Uint8Array && entry.consentReproduction && entry.sheetKind !== "alta-foaie"
      ? cupRaw
      : null;
  const cupExtension = !cupBytes
    ? null
    : jpegSize(cupBytes)
      ? ("jpg" as const)
      : pngSize(cupBytes)
        ? ("png" as const)
        : null;
  const cup = cupExtension ? cupBytes : null;

  const files = getDrawingFileStore();
  const previous = [entry.imageOriginal, entry.imageWeb, entry.cupMockup];
  const [originalKey, webPath, cupPath] = await Promise.all([
    files.saveOriginal({ bytes: original, type: originalType, code: entry.code }),
    files.savePublic({ bytes: web, kind: "web", code: entry.code }),
    cup && cupExtension
      ? files.savePublic({ bytes: cup, kind: "cup", code: entry.code, extension: cupExtension })
      : null,
  ]);

  await db.setDrawingImage(entry.id, {
    original: originalKey,
    web: webPath,
    width: webCheck.width,
    height: webCheck.height,
    cupMockup: cupPath,
  });
  // The replaced photo is gone for good: nothing else points at it.
  await files.remove(previous);

  const locationName = contestLocation(entry.location).name;
  await recordDrawingAudit(session, {
    action: "desene.fotografie",
    target: entry.id,
    summary: `A încărcat fotografia desenului ${entry.code} (${locationName}).`,
    details: { code: entry.code, replaced: previous[1] !== null },
  });

  let text = strings.saved(entry.code);
  const publishGate =
    form.get("publica") === "1" ? publishRefusal((await campaignMoment()).phase) : null;
  if (form.get("publica") === "1" && publishGate) {
    text = strings.savedNotPublished(entry.code, PHASE_BLOCK_TEXT[publishGate]);
  } else if (form.get("publica") === "1") {
    const result = await db.publishDrawing(entry.id);
    if (result.status === "published") {
      // Counted once per drawing, like the button in the list.
      if (entry.publishedAt === null) {
        await recordServerEvent("publication", { location: entry.location, category: entry.category });
      }
      await recordDrawingAudit(session, {
        action: "desene.publicare",
        target: entry.id,
        summary: `A publicat desenul ${entry.code} în galeria online (${locationName}).`,
        details: { code: entry.code },
      });
      text = strings.published(entry.code);
    } else if (result.status === "blocked") {
      text = strings.savedNotPublished(entry.code, BLOCK_TEXT[result.reason]);
    }
  }

  revalidatePath("/admin/desene", "layout");
  revalidatePath("/campanie-admin", "layout");
  revalidatePath("/desene", "layout");
  return json({ ok: true, text });
}
