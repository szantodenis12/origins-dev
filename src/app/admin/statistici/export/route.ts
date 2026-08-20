import { memberCard } from "@/lib/card";
import { recordAdminAudit } from "@/lib/admin/audit";
import { readStaffSession } from "@/lib/admin/session";
import { getDb } from "@/lib/db";
import { memberExportCsv } from "@/lib/export";

/**
 * The member list as a CSV download, manager only. POST on purpose: the
 * export is audited, so it must never fire off a prefetch or a crawler, and
 * the Statistici page offers it as a plain form for exactly that reason.
 * Like every admin endpoint it re-reads the cookie and re-checks the role
 * itself instead of trusting whoever rendered the button.
 */
export async function POST(): Promise<Response> {
  const session = await readStaffSession();
  if (!session || session.role !== "manager") {
    return new Response(null, { status: 403 });
  }

  const db = getDb();
  const now = new Date();
  const [config, members] = await Promise.all([
    db.getLoyaltyConfig(),
    db.listMembers(),
  ]);

  const rows = await Promise.all(
    members.map(async (member) => {
      // Same resolution the barista panel uses: stamps and Gold are derived,
      // so the export states the member's standing at this very moment.
      const card = memberCard(
        await db.getMemberStamps(member.id),
        await db.getMemberRedemptions(member.id),
        config,
        now,
        { day: member.birthDay, month: member.birthMonth, year: member.birthYear },
      );
      return {
        name: member.name,
        phone: member.phone,
        birthDay: member.birthDay,
        birthMonth: member.birthMonth,
        birthYear: member.birthYear,
        lang: member.lang,
        isStudent: member.isStudent,
        studentVerifiedAt: member.studentVerifiedAt,
        consentVersion: member.consentVersion,
        consentAt: member.consentAt,
        marketingConsentAt: member.marketingConsentAt,
        totalStamps: card.totalStamps,
        goldNow: card.gold.isGold,
        blockedAt: member.blockedAt,
        createdAt: member.createdAt,
      };
    }),
  );

  // The row count says how much personal data left the platform and when.
  await recordAdminAudit(session, {
    action: "membri.export",
    target: "membri",
    summary:
      rows.length === 1
        ? "A exportat lista de membri (1 membru)."
        : `A exportat lista de membri (${rows.length} membri).`,
  });

  // ASCII filename: quoted filenames with diacritics break on enough
  // browsers that "membri" is the safer spelling here.
  const stamp = now.toISOString().slice(0, 10);
  return new Response(memberExportCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="membri-origins-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
