import type {
  Redemption,
  StampEvent,
  StampKind,
  // Explicit .ts extensions: tests import this module under plain Node,
  // whose type stripping resolves relative paths literally.
} from "./loyalty.ts";
import type { LoyaltyConfig } from "./program.ts";

/**
 * The dispute trail at the till: "dar aveam 4 ștampile". Stamps and
 * redemptions merged into one list, newest first, worded for the barista
 * panel. Pure — `lib/admin/panel.ts` resolves the slugs and staff ids into
 * names, tests run this directly under `node --test`.
 */

export interface HistoryEntry {
  /** ISO 8601 — the panel formats it for Bucharest. */
  at: string;
  /** "Ștampilă", "Ștampilă dublă", or the reward name from the config. */
  label: string;
  locationSlug: string;
  staffId: string | null;
}

/** Staff screen: Romanian only. Reward names come from the config instead. */
const STAMP_LABELS: Record<StampKind, string> = {
  normal: "Ștampilă",
  double_tuesday: "Ștampilă dublă",
  review_bonus: "Ștampilă bonus recenzie",
  signup_promo: "Ștampilă la înscriere",
};

export function memberHistory(
  stamps: StampEvent[],
  redemptions: Redemption[],
  config: LoyaltyConfig,
  limit = 20,
): HistoryEntry[] {
  const entries: HistoryEntry[] = [
    ...stamps.map((stamp) => ({
      at: stamp.createdAt,
      label: STAMP_LABELS[stamp.kind],
      locationSlug: stamp.locationSlug,
      staffId: stamp.staffId,
    })),
    ...redemptions.map((redemption) => ({
      at: redemption.createdAt,
      label: config.names[redemption.rewardId].ro,
      locationSlug: redemption.locationSlug,
      staffId: redemption.staffId,
    })),
  ];

  return entries
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}
