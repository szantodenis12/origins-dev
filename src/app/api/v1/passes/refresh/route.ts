import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { memberCard } from "@/lib/card";
import { notifyAllPassesUpdated } from "@/lib/wallet/apns";
import { inspectGoogleObject, notifyGooglePassUpdated } from "@/lib/wallet/google-api";
import { loyaltyClassId, tierKeyFor } from "@/lib/wallet/google";

/**
 * Nightly reconciliation of wallet passes.
 *
 * Every other update hangs off an event: a stamp, a redemption, a campaign.
 * Losing Gold does not — it happens because enough days went by with no
 * visit, and nothing in the request path notices. Without this job a lapsed
 * member keeps a gold card on their phone indefinitely.
 *
 * Gold stays derived (see CITESTE_MAI_INTAI.md): nothing here stores a tier.
 * For Google we ask the pass what it currently shows and correct it when it
 * disagrees; for Apple the pass is rebuilt on fetch, so a nudge is enough.
 *
 * Wire it to a scheduler with CRON_SECRET set, e.g. Vercel Cron once a day.
 */

export const maxDuration = 60;

/**
 * Stop cleanly before the platform kills the function. Whatever is left is
 * picked up by the next run — this job is idempotent, and a member whose card
 * is already correct costs one read.
 */
const BUDGET_MS = 40_000;

/**
 * How many members' Google passes to check at once. Google's per-pass limits
 * are daily, not per-second, so this is bounded by politeness rather than by
 * quota — and it leaves room in the minute for the Apple batch at the end.
 */
const GOOGLE_CONCURRENCY = 6;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const db = getDb();
  const now = new Date();
  const [config, members] = await Promise.all([
    db.getLoyaltyConfig(),
    db.listMembers(),
  ]);

  const summary = {
    checked: 0,
    appleDevicesNudged: 0,
    googleCorrected: 0,
    googleAlreadyCurrent: 0,
    notSaved: 0,
    errors: 0,
    ranOutOfTime: false,
  };

  const deadline = Date.now() + BUDGET_MS;
  const withPass = members.filter((m) => m.passSerial);

  /**
   * Google first, one member at a time but several members at once. Each one
   * is a handful of REST round trips, so doing them strictly in sequence is
   * what made this job run out of its minute after 22 of 56 members.
   */
  let next = 0;
  const worker = async () => {
    while (next < withPass.length) {
      if (Date.now() > deadline) {
        summary.ranOutOfTime = true;
        return;
      }
      const member = withPass[next++];
      summary.checked++;

      try {
        const [stamps, redemptions] = await Promise.all([
          db.getMemberStamps(member.id),
          db.getMemberRedemptions(member.id),
        ]);
        const card = memberCard(stamps, redemptions, config, now, {
          day: member.birthDay,
          month: member.birthMonth,
          year: member.birthYear,
        });

        const wantedClass = loyaltyClassId(tierKeyFor(member, card));
        const wantedBalance = `${Math.min(card.progress, card.spec.cycleLength)} / ${card.spec.cycleLength}`;
        const held = await inspectGoogleObject(member);

        if (held.objectId === null) {
          summary.notSaved++;
        } else if (
          held.classId !== wantedClass ||
          held.balance !== wantedBalance
        ) {
          // Only a real tier move deserves to wake the phone; a drifted stamp
          // count is corrected quietly.
          const tierMoved = held.classId !== wantedClass;
          const result = await notifyGooglePassUpdated(member, card, {
            notify: tierMoved,
          });
          if (result.status === "updated") summary.googleCorrected++;
          else summary.errors++;
        } else {
          summary.googleAlreadyCurrent++;
        }
      } catch (err) {
        console.error(`[refresh] ${member.passSerial} failed:`, err);
        summary.errors++;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(GOOGLE_CONCURRENCY, withPass.length) }, worker),
  );

  /**
   * Apple last, and as one batch.
   *
   * A nudge per member meant a fresh TLS handshake per member. Sending them
   * together reuses a single HTTP/2 session for every device, which is the
   * difference between seconds and minutes. Apple rebuilds the pass on fetch,
   * so one nudge repairs both the tier and the count, and it stays silent
   * unless a field with a changeMessage actually moved.
   */
  summary.appleDevicesNudged = await notifyAllPassesUpdated();

  console.log("[refresh] done:", JSON.stringify(summary));
  return NextResponse.json({ status: "ok", ranAt: now.toISOString(), summary });
}
