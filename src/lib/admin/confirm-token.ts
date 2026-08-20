import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The token behind the two-press confirmation on /admin/setari.
 *
 * Pure and secret-injected so it can be tested without Next: the caller
 * supplies the key. Two properties matter, and both are the reason this is
 * not a plain hash of the settings:
 *
 *   1. Only the server can mint it. A hash of the config is derivable by
 *      anyone who can post the form, so the warning could be skipped without
 *      ever having been shown.
 *   2. It covers the WARNING, not just the settings. The impact is measured
 *      against live members, so a stamp landing between the two presses
 *      changes what the second press would do. Folding the numbers in means
 *      a changed impact asks again instead of saving something the manager
 *      never read.
 */
export interface ConfirmImpact {
  losesReward: number;
  needsMoreStamps: number;
}

export function programConfirmToken(
  config: unknown,
  impact: ConfirmImpact,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(
      JSON.stringify({
        config,
        losesReward: impact.losesReward,
        needsMoreStamps: impact.needsMoreStamps,
      }),
    )
    .digest("base64url")
    .slice(0, 22);
}

/** Constant-time compare, so a wrong token leaks nothing by timing. */
export function confirmTokenMatches(
  supplied: string,
  expected: string,
): boolean {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
