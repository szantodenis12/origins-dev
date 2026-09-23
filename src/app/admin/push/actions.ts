"use server";

import { getDb } from "@/lib/db";
import type { Member, PushCampaign } from "@/lib/db";
import { readStaffSession } from "@/lib/admin/session";
import { isOfferedSegment, MAX_MESSAGE } from "./shared";
import { notifyAllPassesUpdated } from "@/lib/wallet/apns";
import { addGoogleMessage } from "@/lib/wallet/google-api";

/**
 * Push composer mutations. A server function is reachable by direct POST, so
 * this one re-reads the cookie and re-checks the manager role instead of
 * trusting the page that rendered the form.
 */

export interface PushDraft {
  messageRo: string;
  messageHu: string;
  segment: string;
}

export type PushFailure =
  | "unauthorized"
  | "empty_ro"
  | "too_long"
  | "invalid_segment";

export type PushResult =
  | { ok: true; campaign: PushCampaign; campaigns: PushCampaign[] }
  | { ok: false; reason: PushFailure };

export async function createCampaignAction(
  draft: PushDraft,
): Promise<PushResult> {
  const session = await readStaffSession();
  if (!session || session.role !== "manager") {
    return { ok: false, reason: "unauthorized" };
  }

  // A direct POST can carry anything, so nothing here trusts the shape.
  const messageRo = String(draft?.messageRo ?? "").trim();
  const messageHu = String(draft?.messageHu ?? "").trim();
  const segment = String(draft?.segment ?? "");

  if (messageRo.length === 0) return { ok: false, reason: "empty_ro" };
  if (messageRo.length > MAX_MESSAGE || messageHu.length > MAX_MESSAGE) {
    return { ok: false, reason: "too_long" };
  }
  if (!isOfferedSegment(segment)) {
    return { ok: false, reason: "invalid_segment" };
  }

  const staff = await getDb().getStaffForSession(session);

  const campaign = await getDb().createPushCampaign({
    messageRo,
    messageHu: messageHu.length > 0 ? messageHu : null,
    segment,
    staffId: staff?.id ?? null,
  });

  // Reach both wallets. Apple only gets a nudge and re-reads the pass, which
  // is where the campaign text is rendered; Google holds the pass, so the
  // message has to be written into each object.
  try {
    const allMembers = await getDb().listMembers();
    const inSegment = (m: Member): boolean => {
      if (segment === "students") return m.isStudent;
      if (segment === "ro" || segment === "hu") return m.lang === segment;
      return true;
    };
    const targets = allMembers.filter((m) => inSegment(m) && !!m.passSerial);

    await notifyAllPassesUpdated(targets.map((m) => m.passSerial));

    // Sequential on purpose: Google counts a notification per pass per day,
    // and a burst of parallel writes only spends that quota faster.
    let sent = 0;
    for (const member of targets) {
      const text =
        member.lang === "hu" && messageHu.length > 0 ? messageHu : messageRo;
      const result = await addGoogleMessage(member, "Noutăți Origins", text);
      if (result === "sent") sent++;
      if (result === "skipped") break; // not configured; no point looping
    }
    if (sent > 0) {
      console.log(`[push-action] Google message delivered to ${sent} pass(es)`);
    }
  } catch (err) {
    console.error("[push-action] Error sending broadcast notifications:", err);
  }

  // The list comes back with the campaign so the history updates in place.
  return { ok: true, campaign, campaigns: await getDb().listPushCampaigns() };
}
