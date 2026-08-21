/**
 * Loyalty rules for the Origins card — pure functions only.
 *
 * No I/O, no React, no DB access, no imports with side effects: the admin
 * routes, the memory adapter and the future Supabase adapter all call into
 * here, and `tests/loyalty.test.mjs` runs this file directly under
 * `node --test`. Keep it that way.
 *
 * The numbers are NOT here — they live in `program.ts` (`LoyaltyConfig`) and
 * are edited by the manager in /admin/setari. Every function below takes the
 * config, or the card spec derived from it, as an argument. Defaults today
 * (Roland, 07.08.2026):
 *   5 stamps  -> free drink        (redeeming it starts a new card)
 *   Gold card -> 4 stamps          (after 4 completed standard cards)
 *   Tuesday 14:00-16:59 Europe/Bucharest -> the stamp counts double
 *   max 1 scan stamp per member per location per rolling 2 hours
 */

import {
  DEFAULT_LOYALTY_CONFIG,
  type BirthdayConfig,
  type DoubleStampConfig,
  type LoyaltyConfig,
  type RewardId,
  type RewardText,
  // Explicit .ts extension: tests import this module under plain Node,
  // whose type stripping resolves relative paths literally.
} from "./program.ts";

export type {
  LoyaltyConfig,
  PerkId,
  RewardId,
  RewardText,
} from "./program.ts";
export { DEFAULT_LOYALTY_CONFIG, sanitizeLoyaltyConfig } from "./program.ts";

export type StampKind =
  | "normal"
  /** Historic id: the double-stamp window, whichever day it is set to. */
  | "double_tuesday"
  | "review_bonus"
  | "signup_promo";

export interface StampEvent {
  id: number;
  memberId: string;
  locationSlug: string;
  staffId: string | null;
  kind: StampKind;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

export interface Redemption {
  id: number;
  memberId: string;
  rewardId: RewardId;
  locationSlug: string;
  staffId: string | null;
  createdAt: string;
  /**
   * For Gold perks: the perk period (ISO) the redemption consumed, frozen at
   * redeem time. Recomputing the period from config alone would hand out a
   * second perk whenever the manager edits `periodDays` or `anchorDate` and
   * yesterday's claim falls outside the recomputed window. Absent on card
   * rewards and on rows written before this field existed.
   */
  perkPeriodStart?: string | null;
  perkPeriodEnd?: string | null;
}

export interface RewardDef {
  id: RewardId;
  /** 0 for Gold perks: they are earned by the calendar, not by the card. */
  stampsRequired: number;
  name: RewardText;
  /** Using this reward closes the current card and stamps restart at zero. */
  resetsCycle: boolean;
}

/**
 * Structural, not configurable: the free drink is what ends a card. Gold
 * perks and the mid-card upgrade are extras handed out along the way.
 */
export function resetsCycle(id: RewardId): boolean {
  return id === "free_coffee";
}

/** The card a member is on right now. Gold members are on a shorter one. */
export interface CardSpec {
  isGold: boolean;
  cycleLength: number;
  rewards: RewardDef[];
}

export function cardSpec(
  config: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG,
  isGold = false,
): CardSpec {
  const gold = isGold && config.gold.enabled;
  const cycleLength = gold ? config.gold.cycleLength : config.cycleLength;
  const rewards: RewardDef[] = [];

  if (config.midReward.enabled && config.midReward.stampsRequired < cycleLength) {
    rewards.push({
      id: "upgrade",
      stampsRequired: config.midReward.stampsRequired,
      name: config.names.upgrade,
      resetsCycle: false,
    });
  }
  rewards.push({
    id: "free_coffee",
    stampsRequired: cycleLength,
    name: config.names.free_coffee,
    resetsCycle: true,
  });

  return { isGold: gold, cycleLength, rewards };
}

export function rewardName(
  id: RewardId,
  config: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG,
): RewardText {
  return config.names[id];
}

/** Anti-abuse: rolling window, per member, per location. */
export const TIMEZONE = "Europe/Bucharest";

/**
 * Kinds handed out by scanning. The review bonus and the signup promo are
 * granted deliberately by a barista, so they neither trigger nor respect the
 * 2h anti-abuse window.
 */
const SCAN_KINDS: StampKind[] = ["normal", "double_tuesday"];

/* ---------------------------------------------------------------- time --- */

const zoneParts = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Weekday + wall clock in Bucharest, whatever the server timezone is. Uses
 * Intl rather than a fixed offset so EET/EEST is handled for free.
 */
export function bucharestClock(at: Date): {
  weekday: string;
  weekdayIndex: number;
  hour: number;
  minute: number;
} {
  const parts = zoneParts.formatToParts(at);
  const find = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const weekday = find("weekday");
  return {
    weekday,
    weekdayIndex: WEEKDAY_INDEX[weekday] ?? 0,
    hour: Number(find("hour")),
    minute: Number(find("minute")),
  };
}

/** "15:40" in Bucharest time — used for the "come back after" notice. */
export function formatBucharestTime(at: Date | string): string {
  const date = typeof at === "string" ? new Date(at) : at;
  const { hour, minute } = bucharestClock(date);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const dateParts = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date in Bucharest — the program's days are café days, not UTC. */
export function bucharestDate(at: Date): {
  year: number;
  month: number;
  day: number;
} {
  const parts = dateParts.formatToParts(at);
  const find = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: find("year"), month: find("month"), day: find("day") };
}

/** Inside the configured double-stamp window (default Tuesday 14:00-16:59). */
export function isDoubleStamp(
  at: Date,
  config: DoubleStampConfig = DEFAULT_LOYALTY_CONFIG.doubleStamp,
): boolean {
  if (!config.enabled) return false;
  const { weekdayIndex, hour } = bucharestClock(at);
  return (
    weekdayIndex === config.weekday &&
    hour >= config.fromHour &&
    hour < config.toHour
  );
}

/** What a scan produces right now. */
export function nextStampKind(
  at: Date,
  config: DoubleStampConfig = DEFAULT_LOYALTY_CONFIG.doubleStamp,
): "normal" | "double_tuesday" {
  return isDoubleStamp(at, config) ? "double_tuesday" : "normal";
}

/** How many stamps a single event is worth. */
export function stampWorth(kind: StampKind): number {
  return kind === "double_tuesday" ? 2 : 1;
}

/* -------------------------------------------------------------- balance --- */

function time(value: string): number {
  return new Date(value).getTime();
}

function byTimeDesc(a: { createdAt: string }, b: { createdAt: string }) {
  return time(b.createdAt) - time(a.createdAt);
}

function byTimeAsc(a: { createdAt: string }, b: { createdAt: string }) {
  return time(a.createdAt) - time(b.createdAt);
}

/**
 * Start of the current card. Null while the member is on their first card:
 * everything counts. Otherwise it is the moment the last free drink was
 * handed over.
 */
export function cycleStartAt(redemptions: Redemption[]): string | null {
  const resets = redemptions.filter((r) => resetsCycle(r.rewardId)).sort(byTimeDesc);
  return resets.length > 0 ? resets[0].createdAt : null;
}

/**
 * Stamps on the current card, double stamps counted twice.
 *
 * When `cycleLength` is given, the full history is replayed so surplus can
 * survive any number of cards: a double stamp can overshoot a card, and a
 * stamp the member paid for must never evaporate at the next reset. Each
 * reset consumes the length of the card it closed, supplied by
 * `cycleLengthAtReset`; without a resolver, every past card uses the current
 * length. Those lengths are deliberately re-evaluated retroactively, like
 * Gold qualification: raising one can consume carry that the old settings
 * preserved, while lowering one can create carry. A carry is capped below
 * the length of the card it opens so no new card is born complete.
 *
 * Callers that pass no length get the old behaviour: no carry-over.
 */
export function cycleStamps(
  stamps: StampEvent[],
  redemptions: Redemption[],
  cycleLength?: number,
  /**
   * Resolves how long the card closed by this reset actually was. It is not
   * always the current length when a history crosses Gold qualification or a
   * lapse. Callers without that history knowledge use the current length for
   * every reset.
   */
  cycleLengthAtReset?: (resetAt: string) => number,
): number {
  const start = cycleStartAt(redemptions);
  const from = start === null ? -Infinity : time(start);
  const current = stamps
    .filter((s) => time(s.createdAt) > from)
    .reduce((total, s) => total + stampWorth(s.kind), 0);

  if (
    start === null ||
    cycleLength === undefined ||
    !Number.isFinite(cycleLength) ||
    cycleLength < 1
  ) {
    return current;
  }

  const resets = redemptions
    .filter((r) => resetsCycle(r.rewardId))
    .sort(byTimeAsc);
  const resolveLength = cycleLengthAtReset ?? (() => cycleLength);
  const completedLengths = resets.map((reset) => {
    const resolved = resolveLength(reset.createdAt);
    return Number.isFinite(resolved) && resolved >= 1 ? resolved : cycleLength;
  });

  type CycleEvent =
    | { at: number; order: 0; worth: number }
    | { at: number; order: 1; resetIndex: number };
  const events: CycleEvent[] = [
    ...stamps.map((stamp) => ({
      at: time(stamp.createdAt),
      order: 0 as const,
      worth: stampWorth(stamp.kind),
    })),
    ...resets.map((reset, resetIndex) => ({
      at: time(reset.createdAt),
      order: 1 as const,
      resetIndex,
    })),
  ].sort((a, b) => a.at - b.at || a.order - b.order);

  let balance = 0;
  for (const event of events) {
    if (event.order === 0) {
      balance += event.worth;
      continue;
    }

    balance = Math.max(0, balance - completedLengths[event.resetIndex]);

    // The next reset tells us the length of the card just opened; after the
    // final reset, `cycleLength` is the known length of the current card.
    const openedCardLength =
      completedLengths[event.resetIndex + 1] ?? cycleLength;
    balance = Math.min(balance, openedCardLength - 1);
  }

  return balance;
}

/** Lifetime total, for stats and for the "member since" feel. */
export function totalStamps(stamps: StampEvent[]): number {
  return stamps.reduce((total, s) => total + stampWorth(s.kind), 0);
}

/** Rewards used on the current card. */
export function redeemedInCycle(redemptions: Redemption[]): RewardId[] {
  const start = cycleStartAt(redemptions);
  const from = start === null ? -Infinity : time(start);
  return redemptions
    .filter((r) => time(r.createdAt) > from)
    .map((r) => r.rewardId);
}

/**
 * Card rewards the barista can hand over right now: threshold reached on the
 * current card and not already used on it. Gold perks are period-based and
 * come from `gold.ts` instead.
 */
export function availableRewards(
  stamps: StampEvent[],
  redemptions: Redemption[],
  spec: CardSpec = cardSpec(),
  /**
   * The progress already resolved by the caller. `lib/card.ts` knows how long
   * the previous card was and this one does not, so it hands the number over
   * instead of letting the two disagree about a carried stamp.
   */
  resolvedProgress?: number,
): RewardDef[] {
  // Only memberCard can resolve every historic card length. Other callers
  // count raw progress since the last reset: conservative means a real carry
  // may wait for the honest path, but a free drink is never invented.
  const progress = resolvedProgress ?? cycleStamps(stamps, redemptions);
  const used = redeemedInCycle(redemptions);
  return spec.rewards.filter(
    (reward) => progress >= reward.stampsRequired && !used.includes(reward.id),
  );
}

export function canRedeem(
  stamps: StampEvent[],
  redemptions: Redemption[],
  rewardId: RewardId,
  spec: CardSpec = cardSpec(),
  resolvedProgress?: number,
): boolean {
  return availableRewards(stamps, redemptions, spec, resolvedProgress).some(
    (r) => r.id === rewardId,
  );
}

/* ------------------------------------------------------------- birthday --- */

const DAY_MS = 24 * 60 * 60 * 1000;

/** A member's birthdate; all three null on legacy/demo rows — never eligible. */
export interface BirthDate {
  day: number | null;
  month: number | null;
  year: number | null;
}

/**
 * Whether the birthday drink can be claimed right now. Pure, derived from
 * the birthdate + redemption history, on the Bucharest calendar — a member
 * born on the 10th gets their drink on the café's 10th, wherever the server
 * runs.
 *
 * The window opens on the birthday and stays open `windowDays` days after
 * it (0 = the day itself). It can spill past New Year, so both this year's
 * and last year's birthday are considered as anchors. One drink per
 * birthday: a `birthday_drink` redeemed on or after the active window's
 * start blocks the rest of it. For a window that sits inside one year this
 * is exactly "once per calendar year"; at the year boundary it rounds in
 * the customer's favour — a December birthday claimed in January neither
 * doubles up nor eats the next year's drink.
 *
 * A 29 February birthday lands on 1 March in non-leap years (Date.UTC rolls
 * the date over), so the drink exists every year, never only in leap years.
 */
export function birthdayRewardAvailable(
  birth: BirthDate,
  redemptions: Redemption[],
  now: Date,
  config: BirthdayConfig = DEFAULT_LOYALTY_CONFIG.birthday,
): boolean {
  if (!config.enabled) return false;
  const { day, month } = birth;
  if (day === null || month === null || birth.year === null) return false;

  const today = bucharestDate(now);
  const todayMs = Date.UTC(today.year, today.month - 1, today.day);

  const windowStart = [today.year, today.year - 1]
    .map((year) => Date.UTC(year, month - 1, day))
    .find((anchor) => {
      const days = (todayMs - anchor) / DAY_MS;
      return days >= 0 && days <= config.windowDays;
    });
  if (windowStart === undefined) return false;

  return !redemptions.some((r) => {
    if (r.rewardId !== "birthday_drink") return false;
    const d = bucharestDate(new Date(r.createdAt));
    return Date.UTC(d.year, d.month - 1, d.day) >= windowStart;
  });
}

/* ----------------------------------------------------------- anti-abuse --- */

export interface StampWindow {
  /** True while a new scan stamp would be refused. */
  blocked: boolean;
  /** Last scan stamp at this location, ISO, null if none. */
  lastStampAt: string | null;
  /** When the next scan stamp becomes possible, ISO, null if none needed. */
  nextAllowedAt: string | null;
}

/**
 * Stamp window check — time-based restriction disabled per client request.
 * Members can receive multiple stamps per day or per order at the same location.
 */
export function stampWindow(
  stamps: StampEvent[],
  locationSlug: string,
  now: Date,
  windowHours: number = DEFAULT_LOYALTY_CONFIG.stampWindowHours,
): StampWindow {
  const last = stamps
    .filter(
      (s) => s.locationSlug === locationSlug && SCAN_KINDS.includes(s.kind),
    )
    .sort(byTimeDesc)[0];

  return {
    blocked: false,
    lastStampAt: last?.createdAt ?? null,
    nextAllowedAt: null,
  };
}
