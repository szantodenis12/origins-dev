import { readDrawingAccess, recordDrawingAudit } from "@/lib/admin/drawing-access";
import { getDb } from "@/lib/db";
import { getDrawingFileStore } from "@/lib/storage/drawings";

/**
 * The untouched camera file of one drawing, manager only: this is what
 * goes to the cup supplier on 04.12. The original has no public URL; this
 * route is the only way out, and each download lands in the Jurnal. POST so
 * a prefetch can never trigger it.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await readDrawingAccess();
  if (!session || session.role !== "manager") {
    return new Response(null, { status: 403 });
  }

  const entry = await getDb().getDrawingEntry((await params).id);
  if (!entry?.imageOriginal) return new Response(null, { status: 404 });

  const file = await getDrawingFileStore().readOriginal(entry.imageOriginal);
  if (!file) return new Response(null, { status: 404 });

  await recordDrawingAudit(session, {
    action: "desene.original",
    target: entry.id,
    summary: `A descărcat fotografia originală a desenului ${entry.code}.`,
    details: { code: entry.code },
  });

  const extension = file.filename.slice(file.filename.lastIndexOf("."));
  return new Response(file.bytes as BodyInit, {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `attachment; filename="${entry.code}-original${extension}"`,
      "Cache-Control": "no-store",
    },
  });
}
