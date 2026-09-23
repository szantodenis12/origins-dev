import type { Member } from "../db/index.ts";
import { getDb } from "../db/index.ts";
import { memberCard } from "../card.ts";
import { notifyPassUpdated } from "./apns.ts";
import { notifyGooglePassUpdated } from "./google-api.ts";

/**
 * One member's card changed — tell both wallets.
 *
 * The two platforms want opposite things. Apple only gets a nudge and comes
 * back for the whole pass, so the work is in reaching the phone. Google holds
 * the pass itself, so the work is in patching it. Callers should not have to
 * know that, and neither may ever be skipped because the other failed.
 *
 * This is awaited on the barista's scan path, so both sides carry their own
 * timeouts and neither throws: a stamp that was recorded must never look like
 * a failure because a wallet was slow.
 */
export async function notifyWalletsForMember(member: Member): Promise<void> {
  try {
    const db = getDb();
    const [config, stamps, redemptions] = await Promise.all([
      db.getLoyaltyConfig(),
      db.getMemberStamps(member.id),
      db.getMemberRedemptions(member.id),
    ]);

    const card = memberCard(stamps, redemptions, config, new Date(), {
      day: member.birthDay,
      month: member.birthMonth,
      year: member.birthYear,
    });

    const [apple, google] = await Promise.allSettled([
      notifyPassUpdated(member.passSerial),
      notifyGooglePassUpdated(member, card),
    ]);

    if (apple.status === "rejected") {
      console.error("[wallet] Apple notify failed:", apple.reason);
    }
    if (google.status === "rejected") {
      console.error("[wallet] Google notify failed:", google.reason);
    } else if (google.value.status === "updated" && google.value.tierChanged) {
      console.log(`[wallet] Google tier synced for ${member.passSerial}`);
    }
  } catch (err) {
    console.error("[wallet] notifyWalletsForMember error:", err);
  }
}
