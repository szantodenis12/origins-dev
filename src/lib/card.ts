import {
  availableRewards,
  birthdayRewardAvailable,
  cardSpec,
  cycleStamps,
  cycleStartAt,
  totalStamps,
  type BirthDate,
  type CardSpec,
  type LoyaltyConfig,
  type Redemption,
  type RewardDef,
  type StampEvent,
  // Explicit .ts extensions: tests import this module under plain Node,
  // whose type stripping resolves relative paths literally.
} from "./loyalty.ts";
import { goldStatus, perkState, type GoldStatus, type PerkState } from "./gold.ts";
import { DEFAULT_LOYALTY_CONFIG } from "./program.ts";

/**
 * One member's standing, resolved in one place.
 *
 * Gold decides which card the member is on, and the card decides which
 * rewards are earned — so anything that answers "what can this person get
 * right now" (the barista panel, the redeem check in the adapter, the web
 * card) must go through here instead of recomputing half of it.
 *
 * Pure: no I/O, no React. Tests run it directly under `node --test`.
 */
export interface MemberCard {
  gold: GoldStatus;
  spec: CardSpec;
  /** Stamps on the current card, double stamps already counted twice. */
  progress: number;
  totalStamps: number;
  /** Stamps still missing for the free drink; 0 once it is earned. */
  remaining: number;
  /** The Gold perk of the current period, null when not Gold / disabled. */
  perk: PerkState | null;
  /**
   * True when the member is no longer Gold but the card in progress started
   * while they were, so it keeps the Gold length until it is completed.
   */
  keptGoldLength: boolean;
  /** The birthday drink is claimable right now (lib/loyalty.ts). */
  birthdayAvailable: boolean;
  /** Earned on the card itself — what the card face may announce. */
  cardRewards: RewardDef[];
  /** Everything the barista may hand over now: card rewards + the perk. */
  rewards: RewardDef[];
}

function keepsGoldLength(
  gold: GoldStatus,
  cycleStart: string | null,
): boolean {
  return (
    !gold.isGold &&
    gold.downgradedAt !== null &&
    (cycleStart === null ||
      new Date(cycleStart).getTime() < new Date(gold.downgradedAt).getTime())
  );
}

export function memberCard(
  stamps: StampEvent[],
  redemptions: Redemption[],
  config: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG,
  now: Date = new Date(),
  /** The member's birthdate; omitted = no birthday reward resolved. */
  birth: BirthDate | null = null,
): MemberCard {
  // Every rule below must see the same point in time. Gold already ignores
  // future events internally, but the card cycle, totals, perks and birthday
  // checks do not; cutting both histories once prevents clock-skewed rows from
  // making those answers disagree.
  const asOf = now.getTime();
  const visibleStamps = stamps.filter(
    (stamp) => new Date(stamp.createdAt).getTime() <= asOf,
  );
  const visibleRedemptions = redemptions.filter(
    (redemption) => new Date(redemption.createdAt).getTime() <= asOf,
  );
  const gold = goldStatus(visibleStamps, visibleRedemptions, now, config.gold);

  // A lapse must never take back progress: a member at 3/4 on a Gold card who
  // goes quiet does not wake up at 3/5. The card in progress keeps the length
  // it started with; the standard length applies from the NEXT card. The card
  // started before the lapse when the last reset predates `downgradedAt` — and
  // a member with no reset yet has been on the same card since forever, which
  // is before any lapse.
  const cycleStart = cycleStartAt(visibleRedemptions);
  const keptGoldLength = keepsGoldLength(gold, cycleStart);

  const spec = cardSpec(config, gold.isGold || keptGoldLength);

  // Resolve every completed card one millisecond before its reset: the reset
  // itself can grant Gold, so reading after it would measure the old standard
  // card as a Gold card. A card that crossed a lapse still keeps the Gold
  // length it started with, exactly as the current card does above.
  const cycleLengthAtReset = (resetAt: string): number => {
    const resetTime = new Date(resetAt).getTime();
    const beforeReset = new Date(resetTime - 1);
    const goldBeforeReset = goldStatus(
      visibleStamps,
      visibleRedemptions,
      beforeReset,
      config.gold,
    );
    const priorRedemptions = visibleRedemptions.filter(
      (redemption) => new Date(redemption.createdAt).getTime() < resetTime,
    );
    const priorCycleStart = cycleStartAt(priorRedemptions);
    const keptAtReset = keepsGoldLength(goldBeforeReset, priorCycleStart);
    return cardSpec(config, goldBeforeReset.isGold || keptAtReset).cycleLength;
  };

  const progress = cycleStamps(
    visibleStamps,
    visibleRedemptions,
    spec.cycleLength,
    cycleLengthAtReset,
  );
  const perk = perkState(gold, visibleRedemptions, now, config.gold);

  const cardRewards = availableRewards(
    visibleStamps,
    visibleRedemptions,
    spec,
    progress,
  );
  const rewards = [...cardRewards];
  if (perk?.available) {
    rewards.push({
      id: perk.period.perk,
      stampsRequired: 0,
      name: config.names[perk.period.perk],
      resetsCycle: false,
    });
  }

  // The birthday drink rides on the calendar, not the card: it joins the
  // redeemable list (so the adapter's earned check covers it) but never the
  // card rewards the plate announces.
  const birthdayAvailable =
    birth !== null &&
    birthdayRewardAvailable(birth, visibleRedemptions, now, config.birthday);
  if (birthdayAvailable) {
    rewards.push({
      id: "birthday_drink",
      stampsRequired: 0,
      name: config.names.birthday_drink,
      resetsCycle: false,
    });
  }

  return {
    gold,
    spec,
    progress,
    totalStamps: totalStamps(visibleStamps),
    remaining: Math.max(0, spec.cycleLength - progress),
    perk,
    keptGoldLength,
    birthdayAvailable,
    cardRewards,
    rewards,
  };
}
