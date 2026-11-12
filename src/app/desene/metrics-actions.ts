"use server";

import { getDb } from "@/lib/db";
import { isClientEventName, sanitizeEventProps } from "@/lib/campaign-metrics";
import { rateLimitAllow, requestAddress } from "@/lib/campaign-server";

/**
 * The browser's half of the first-party measurement: instructions_view,
 * prereg_start, share, map_click. Best effort and silent: the page fires
 * it and never waits on the answer.
 *
 * Reachable by direct POST like any server function, so: only the four
 * client event names (the server events cannot be faked from here), only
 * the whitelisted slug props (no name, phone, e-mail or id survives
 * `sanitizeEventProps`), and a shared limit per address. No cookie, no
 * fingerprint, no third party.
 */

/** Generous for a person clicking around, tight for a script. */
const LIMIT = { limit: 120, windowMs: 60 * 60_000 };

export async function trackCampaignEventAction(
  name: string,
  props: Record<string, string>,
): Promise<{ ok: boolean }> {
  if (typeof name !== "string" || !isClientEventName(name)) return { ok: false };
  const clean = sanitizeEventProps(props && typeof props === "object" ? props : {});
  try {
    if (!(await rateLimitAllow(`metrics-ip:${await requestAddress()}`, LIMIT))) {
      return { ok: false };
    }
    await getDb().recordCampaignEvent({ name, ...clean });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
