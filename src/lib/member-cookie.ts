/**
 * The card the browser last opened, remembered on the device.
 *
 * Spec §6.4 sends a member who lost the card link to the counter. That stays
 * the fallback, but most of them lost nothing more than a browser tab: the
 * id kept here lets /card hand the card straight back, on this phone only.
 *
 * The value is the member id, which is already in the URL of the page that
 * sets it — the cookie leaks nothing new. It is httpOnly because only the
 * server reads it, and the id is the whole access control of /card/{id}.
 */

export const MEMBER_COOKIE = "origins_member";

/**
 * A year, refreshed on every visit to the card, so an active member never
 * gets logged out of their own card by the calendar. Browsers cap cookie
 * lifetime at 400 days anyway.
 */
export const MEMBER_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/**
 * Shape check only — whether the id belongs to a member is the database's
 * answer, not ours. Real ids are UUIDs, seeded ones are "demo-N"; anything
 * outside that alphabet came from a hand-edited URL and never reaches a query.
 */
export function isMemberId(value: string): boolean {
  return /^[A-Za-z0-9-]{1,64}$/.test(value);
}
