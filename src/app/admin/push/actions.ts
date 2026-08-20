"use server";

import { getDb } from "@/lib/db";
import type { PushCampaign } from "@/lib/db";
import { readStaffSession } from "@/lib/admin/session";
import { isOfferedSegment, MAX_MESSAGE } from "./shared";

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

  // The list comes back with the campaign so the history updates in place.
  return { ok: true, campaign, campaigns: await getDb().listPushCampaigns() };
}
