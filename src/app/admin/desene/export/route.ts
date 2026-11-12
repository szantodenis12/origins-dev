import { readDrawingAccess, recordDrawingAudit } from "@/lib/admin/drawing-access";
import { getDb } from "@/lib/db";
import { contestLocation, drawingIsLive } from "@/lib/drawing";
import { drawingExportCsv } from "@/lib/export";

/**
 * The drawing entries as a CSV download, manager only — the ONE place the
 * parents' names and phone numbers leave the platform (the staff list
 * never shows them). POST like the member export: audited, so it must never
 * fire off a prefetch, and the role is re-checked here, not trusted from
 * whoever rendered the button.
 */
export async function POST(): Promise<Response> {
  const session = await readDrawingAccess();
  if (!session || session.role !== "manager") {
    return new Response(null, { status: 403 });
  }

  const entries = await getDb().listDrawingEntries();
  const rows = entries.map((entry) => ({
    code: entry.code,
    locationName: contestLocation(entry.location).name,
    childFirstName: entry.childFirstName,
    childAge: entry.childAge,
    category: entry.category,
    parentName: entry.parentName,
    phone: entry.phone,
    consentReproduction: entry.consentReproduction,
    attribution: entry.attribution,
    consentPhoto: entry.consentPhoto,
    circleOptIn: entry.circleOptIn,
    status: entry.status,
    registeredVia: entry.registeredVia,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    consentGallery: entry.consentGallery,
    publishedAt: entry.publishedAt,
    online: drawingIsLive(entry),
    voteWinner: entry.voteWinner,
  }));

  // The row count says how much personal data left the platform and when.
  await recordDrawingAudit(session, {
    action: "desene.export",
    target: "desene",
    summary:
      rows.length === 1
        ? "A exportat lista de desene (1 înscriere)."
        : `A exportat lista de desene (${rows.length} înscrieri).`,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(drawingExportCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="desene-origins-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
