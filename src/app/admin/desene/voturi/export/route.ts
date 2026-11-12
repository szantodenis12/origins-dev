import { readDrawingAccess, recordDrawingAudit } from "@/lib/admin/drawing-access";
import { getDb } from "@/lib/db";
import { voteExportCsv } from "@/lib/export";

/**
 * Every vote as a CSV, manager only: drawing code, age group, time, and the
 * keyed HASH of the voter's e-mail. There is no address to export: none is
 * stored. POST and audited, like the other exports.
 */
export async function POST(): Promise<Response> {
  const session = await readDrawingAccess();
  if (!session || session.role !== "manager") {
    return new Response(null, { status: 403 });
  }

  const db = getDb();
  const [entries, votes] = await Promise.all([
    db.listDrawingEntries(),
    db.listDrawingVotes(),
  ]);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const rows = votes.flatMap((vote) => {
    const entry = byId.get(vote.drawingId);
    return entry
      ? [
          {
            code: entry.code,
            category: entry.category,
            emailHash: vote.emailHash,
            createdAt: vote.createdAt,
          },
        ]
      : [];
  });

  await recordDrawingAudit(session, {
    action: "desene.export-voturi",
    target: "desene",
    summary: `A exportat voturile concursului de desene (${rows.length}).`,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(voteExportCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="voturi-desene-origins-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
