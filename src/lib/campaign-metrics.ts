/**
 * First-party campaign measurement: the contract. Pure, no I/O.
 *
 * What is counted is an EVENT NAME plus a few whitelisted, non-identifying
 * properties. Never a child's name, a parent's name, a phone, an e-mail, a
 * drawing id or anything that joins back to a person. No cookie, no
 * fingerprint, no third-party analytics: the rows land in our own table
 * (`campaign_events`) and the manager sees totals per day / channel / café.
 *
 * Counted on the SERVER (cannot be faked from a browser, always recorded):
 *   prereg_complete, physical_submission, publication,
 *   vote_code_request, vote_confirmed
 * Counted from the BROWSER (best effort, through a rate-limited server action):
 *   instructions_view, prereg_start, share, map_click
 *
 * Unique families are NOT an event: they are derived in the admin from the
 * stored entries (distinct parent phones among physically submitted drawings).
 * One drawing is not one family.
 */

export const SERVER_EVENTS = [
  "prereg_complete",
  "physical_submission",
  "publication",
  "vote_code_request",
  "vote_confirmed",
] as const;

export const CLIENT_EVENTS = [
  "instructions_view",
  "prereg_start",
  "share",
  "map_click",
] as const;

export type ServerEvent = (typeof SERVER_EVENTS)[number];
export type ClientEvent = (typeof CLIENT_EVENTS)[number];
export type CampaignEventName = ServerEvent | ClientEvent;

export interface CampaignEventProps {
  /** Café slug ("rogerius" | "era" | "palatul-copiilor") when relevant. */
  location?: string;
  /** Acquisition channel, from `?ch=` / utm_source on the landing URL. */
  channel?: string;
  /** Age group "3-5" | "6-9" | "10-14" — a bucket, not a person. */
  category?: string;
  /** share: "whatsapp" | "facebook" | "copy" | "native" | "download". */
  method?: string;
}

export interface CampaignEvent extends CampaignEventProps {
  name: CampaignEventName;
  createdAt: string;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function isCampaignEventName(value: string): value is CampaignEventName {
  return (
    (SERVER_EVENTS as readonly string[]).includes(value) ||
    (CLIENT_EVENTS as readonly string[]).includes(value)
  );
}

export function isClientEventName(value: string): value is ClientEvent {
  return (CLIENT_EVENTS as readonly string[]).includes(value);
}

/**
 * Drops everything that is not a short lowercase slug. Free text from a URL
 * could carry a name or a phone ("?ch=ana-0740..."): digits runs of 6+ and
 * "@" are refused outright.
 */
export function sanitizeEventProps(raw: Record<string, unknown>): CampaignEventProps {
  const out: CampaignEventProps = {};
  for (const key of ["location", "channel", "category", "method"] as const) {
    const value = raw[key];
    if (typeof value !== "string") continue;
    const v = value.trim().toLowerCase();
    if (!SLUG.test(v) || /\d{6,}/.test(v)) continue;
    out[key] = v;
  }
  return out;
}
