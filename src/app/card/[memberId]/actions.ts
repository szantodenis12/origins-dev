"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { reviewUrlForMember } from "@/lib/review";

/**
 * "Lasă o recenzie" on the member's own card — the one public page that
 * knows who the visitor is, which is why `reviewIntentAt` could never be set
 * from the location page. Marks the intent, then sends the member to the
 * Google review page. The bonus stamp stays a barista decision at the
 * counter; this only records that the member said they would.
 *
 * The URL is resolved server-side, never taken from the client: a memberId
 * is the whole auth of the card page, and accepting a target URL from the
 * form would turn this into an open redirect.
 */
export async function reviewIntentAction(memberId: string): Promise<void> {
  const db = getDb();
  const member = await db.getMember(memberId);
  if (!member) return;

  const url = await reviewUrlForMember(db, member.id);
  if (!url) return;

  await db.markReviewIntent(member.id);
  redirect(url);
}
