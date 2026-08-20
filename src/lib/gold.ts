import {
  resetsCycle,
  type Redemption,
  type StampEvent,
  // Explicit .ts extension: tests import this module under plain Node,
  // whose type stripping resolves relative paths literally.
} from "./loyalty.ts";
import {
  DEFAULT_LOYALTY_CONFIG,
  PERK_IDS,
  type GoldConfig,
  type PerkId,
} from "./program.ts";

/**
 * Origins Gold — pure functions only, same contract as loyalty.ts:
 * no I/O, no React, no DB access. `tests/gold.test.mjs` runs this file
 * directly under `node --test`.
 *
 * Rules (Roland 03.08.2026, numbers revised 07.08.2026):
 *   - N completed cards (free-drink redemptions) -> Gold, automatically
 *   - no visit for `inactivityDays` while Gold -> back to the standard card
 *   - after losing Gold, `requalifyCards` completed card(s) win it back
 *   - while Gold: a shorter card (4 + 1) and one rotating perk per period
 *
 * Gold is DERIVED from the stamp/redemption history — never stored. The
 * memory adapter and the Supabase adapter therefore agree by construction,
 * and changing the config re-evaluates everyone retroactively.
 *
 * The numbers live in `program.ts` / the admin settings, never here.
 */

export type { GoldConfig } from "./program.ts";

/** Defaults, for callers that have no config at hand (tests, seeds). */
export const GOLD_CONFIG: GoldConfig = DEFAULT_LOYALTY_CONFIG.gold;

export interface GoldStatus {
  isGold: boolean;
  /** When the current Gold status was earned. */
  goldSince: string | null;
  /** While Gold: the moment status lapses if no new visit happens. */
  expiresAt: string | null;
  /** While Gold: when the "expiră în curând" push should go out. */
  warnAt: string | null;
  /** Held Gold at least once — the requalify threshold applies. */
  everGold: boolean;
  /** Most recent lapse, null if never lapsed. */
  downgradedAt: string | null;
  /** Completed cards counted toward the NEXT qualification. */
  completedCards: number;
  /** `cardsRequired` before the first Gold, `requalifyCards` after a lapse. */
  cardsRequired: number;
}

interface Activity {
  at: number;
  iso: string;
  completesCard: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Walks the member's full activity timeline once, in order. Every stamp and
 * every redemption counts as a visit (all of them happen at the counter);
 * only redemptions that reset the cycle (the free drink) complete a card.
 */
export function goldStatus(
  stamps: StampEvent[],
  redemptions: Redemption[],
  now: Date = new Date(),
  config: GoldConfig = GOLD_CONFIG,
): GoldStatus {
  const off: GoldStatus = {
    isGold: false,
    goldSince: null,
    expiresAt: null,
    warnAt: null,
    everGold: false,
    downgradedAt: null,
    completedCards: 0,
    cardsRequired: config.cardsRequired,
  };
  if (!config.enabled) return off;

  const windowMs = config.inactivityDays * DAY_MS;

  // `now` is the moment the status is asked about, so anything later than it
  // has not happened yet. Passing the current time (the usual call) changes
  // nothing, but it makes the function a true point-in-time replay: callers can
  // ask "was this member Gold when they closed that card", and the phase-3
  // push can ask "were they Gold when the campaign went out".
  const asOf = now.getTime();
  const events: Activity[] = [
    ...stamps.map((s) => ({
      at: new Date(s.createdAt).getTime(),
      iso: s.createdAt,
      completesCard: false,
    })),
    ...redemptions.map((r) => ({
      at: new Date(r.createdAt).getTime(),
      iso: r.createdAt,
      completesCard: resetsCycle(r.rewardId),
    })),
  ]
    .filter((event) => event.at <= asOf)
    .sort((a, b) => a.at - b.at);

  let isGold = false;
  let everGold = false;
  let goldSince: string | null = null;
  let downgradedAt: string | null = null;
  let completedCards = 0;
  let cardsRequired = config.cardsRequired;
  let lastActivity: number | null = null;

  const lapse = (atMs: number) => {
    isGold = false;
    goldSince = null;
    downgradedAt = new Date(atMs).toISOString();
    completedCards = 0;
    cardsRequired = config.requalifyCards;
  };

  for (const event of events) {
    if (isGold && lastActivity !== null && event.at - lastActivity > windowMs) {
      lapse(lastActivity + windowMs);
    }
    if (event.completesCard) {
      completedCards += 1;
      if (!isGold && completedCards >= cardsRequired) {
        isGold = true;
        everGold = true;
        goldSince = event.iso;
      }
    }
    lastActivity = event.at;
  }

  if (isGold && lastActivity !== null && now.getTime() - lastActivity > windowMs) {
    lapse(lastActivity + windowMs);
  }

  const expiresAt =
    isGold && lastActivity !== null
      ? new Date(lastActivity + windowMs).toISOString()
      : null;
  const warnAt =
    isGold && lastActivity !== null
      ? new Date(
          lastActivity + windowMs - config.warningDays * DAY_MS,
        ).toISOString()
      : null;

  return {
    isGold,
    goldSince,
    expiresAt,
    warnAt,
    everGold,
    downgradedAt,
    completedCards: isGold ? 0 : completedCards,
    cardsRequired,
  };
}

/* ------------------------------------------------------------ gold perks -- */

/**
 * One turn of the rotation: which perk a Gold member can claim, and until
 * when. Two clocks, both offered because Roland wanted both available:
 *   shared   — the whole café runs on the same fortnight (from `anchorDate`)
 *   personal — every member's fortnight starts the day they went Gold
 */
export interface PerkPeriod {
  perk: PerkId;
  /** 0-based turn of the rotation since the anchor. */
  index: number;
  startsAt: string;
  endsAt: string;
  /** Roland 07.08.2026: Gold perks are takeaway only. */
  toGoOnly: boolean;
}

/**
 * The anchor is read as midnight UTC rather than midnight Bucharest, so a
 * period flips at 02:00/03:00 local — hours when no café is open, which is
 * exactly where a boundary belongs.
 */
function anchorMs(config: GoldConfig, gold: GoldStatus): number | null {
  if (config.perks.clock === "personal") {
    return gold.goldSince ? new Date(gold.goldSince).getTime() : null;
  }
  const parsed = Date.parse(`${config.perks.anchorDate}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

export function currentPerkPeriod(
  gold: GoldStatus,
  now: Date = new Date(),
  config: GoldConfig = GOLD_CONFIG,
): PerkPeriod | null {
  const { perks } = config;
  if (!config.enabled || !perks.enabled || !gold.isGold) return null;
  if (perks.rotation.length === 0) return null;

  const anchor = anchorMs(config, gold);
  if (anchor === null) return null;

  const periodMs = perks.periodDays * DAY_MS;
  const elapsed = now.getTime() - anchor;
  // Anchor set in the future: the rotation has not started yet.
  if (elapsed < 0) return null;

  const index = Math.floor(elapsed / periodMs);
  const startsAt = anchor + index * periodMs;

  return {
    perk: perks.rotation[index % perks.rotation.length],
    index,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(startsAt + periodMs).toISOString(),
    toGoOnly: perks.toGoOnly,
  };
}

/**
 * When the member already used this period's perk, if they did. One perk per
 * period whichever it was: claiming the add-on and then the extra coffee in
 * the same fortnight is not two perks, it is a double claim.
 *
 * A redemption that carries its own stored period (frozen by the adapter at
 * redeem time) blocks whenever that period OVERLAPS the current one — overlap,
 * not equality, because a settings change reshapes every window and the claim
 * must keep blocking the stretch of calendar it was made in. Rows without a
 * stored period (older data) fall back to the timestamp check.
 */
export function perkUsedAt(
  redemptions: Redemption[],
  period: PerkPeriod,
): string | null {
  const from = new Date(period.startsAt).getTime();
  const to = new Date(period.endsAt).getTime();
  const used = redemptions
    .filter((r) => PERK_IDS.includes(r.rewardId as PerkId))
    .filter((r) => {
      if (r.perkPeriodStart && r.perkPeriodEnd) {
        const start = new Date(r.perkPeriodStart).getTime();
        const end = new Date(r.perkPeriodEnd).getTime();
        return start < to && end > from;
      }
      const at = new Date(r.createdAt).getTime();
      return at >= from && at < to;
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return used.length > 0 ? used[0].createdAt : null;
}

export interface PerkState {
  period: PerkPeriod;
  usedAt: string | null;
  available: boolean;
}

/** What the barista screen and the card page both need about the perk. */
export function perkState(
  gold: GoldStatus,
  redemptions: Redemption[],
  now: Date = new Date(),
  config: GoldConfig = GOLD_CONFIG,
): PerkState | null {
  const period = currentPerkPeriod(gold, now, config);
  if (!period) return null;
  const usedAt = perkUsedAt(redemptions, period);
  return { period, usedAt, available: usedAt === null };
}
