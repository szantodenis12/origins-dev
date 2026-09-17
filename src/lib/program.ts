/**
 * The loyalty program, as data.
 *
 * Everything Origins can change about the mechanics lives in `LoyaltyConfig`:
 * how many stamps a card holds, when Gold is earned, what Gold gives, when a
 * stamp counts double. The manager edits it in /admin/setari, it is stored in
 * the Db, and every pure function in `loyalty.ts` / `gold.ts` takes it as an
 * argument. Changing the program must never mean changing this file.
 *
 * Pure module: no I/O, no React, no imports with side effects. The tests run
 * it directly under `node --test`.
 */

export type RewardId =
  | "upgrade"
  | "free_coffee"
  | "gold_addon"
  | "gold_coffee"
  | "birthday_drink";

/** Gold rewards handed out per period instead of per card. */
export type PerkId = Extract<RewardId, "gold_addon" | "gold_coffee">;

export const PERK_IDS: PerkId[] = ["gold_addon", "gold_coffee"];

export interface RewardText {
  ro: string;
  hu: string;
  en: string;
}

/** "shared" = one fortnight for the whole café; "personal" = per member. */
export type PerkClock = "shared" | "personal";

export interface PerkConfig {
  enabled: boolean;
  /** Length of one perk period, in days. */
  periodDays: number;
  clock: PerkClock;
  /** Day the shared rotation counts from (YYYY-MM-DD, at UTC midnight). */
  anchorDate: string;
  /** The perks, in the order they rotate. */
  rotation: PerkId[];
  /** Gold perks only on takeaway orders (Roland, 07.08.2026). */
  toGoOnly: boolean;
}

export interface GoldConfig {
  enabled: boolean;
  /** Completed cards needed for the first qualification. */
  cardsRequired: number;
  /** Completed cards needed to win Gold back after a downgrade. */
  requalifyCards: number;
  /** Days without any visit before Gold lapses. */
  inactivityDays: number;
  /** How many days before the lapse the warning push goes out. */
  warningDays: number;
  /** Stamps on a Gold card — shorter than the standard one. */
  cycleLength: number;
  perks: PerkConfig;
}

export interface MidRewardConfig {
  enabled: boolean;
  stampsRequired: number;
}

export interface BirthdayConfig {
  enabled: boolean;
  /** Days AFTER the birthday the drink can still be claimed; 0 = day itself. */
  windowDays: number;
}

export interface DoubleStampConfig {
  enabled: boolean;
  /** 0 = Sunday … 2 = Tuesday. */
  weekday: number;
  fromHour: number;
  /** Exclusive: 17 means 16:59 is the last double minute. */
  toHour: number;
}

export interface LoyaltyConfig {
  /** Stamps on a standard card; the drink after them is free. */
  cycleLength: number;
  /** Optional reward mid-card that does not reset it. */
  midReward: MidRewardConfig;
  gold: GoldConfig;
  /** A free drink around the member's birthday. Off until Origins says go. */
  birthday: BirthdayConfig;
  doubleStamp: DoubleStampConfig;
  /** Anti-abuse: one scan stamp per member per location per N hours. */
  stampWindowHours: number;
  /**
   * Max value (lei) of the product a reward covers; null = no cap. Null is
   * the default so nothing changes publicly until Origins decides — the card
   * got shorter and the giveaway rate went up, so the lever exists ready.
   */
  rewardValueCap: number | null;
  names: Record<RewardId, RewardText>;
  /** Set on every save — shown in the admin as "modificat la". */
  updatedAt: string | null;
}

/**
 * Program as agreed with Roland on 07.08.2026:
 *   standard card 5 + 1, Gold after 4 completed cards, Gold card 4 + 1,
 *   Gold perks rotate every 2 weeks (extra, then cafea), takeaway only.
 * These are defaults, not rules — the manager overrides them in admin.
 */
export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = {
  cycleLength: 5,
  midReward: { enabled: false, stampsRequired: 3 },
  gold: {
    enabled: true,
    cardsRequired: 4,
    requalifyCards: 1,
    inactivityDays: 14,
    warningDays: 3,
    cycleLength: 4,
    perks: {
      enabled: true,
      periodDays: 14,
      clock: "shared",
      // A Monday, so the fortnight the whole café runs on starts with the
      // week. Must not be in the future, or the rotation has not begun.
      anchorDate: "2026-08-03",
      rotation: ["gold_addon", "gold_coffee"],
      toGoOnly: true,
    },
  },
  // Disabled until Origins turns it on; 7 days to claim feels like a present,
  // not a deadline, and costs the café nothing extra per member.
  birthday: { enabled: false, windowDays: 7 },
  doubleStamp: { enabled: true, weekday: 2, fromHour: 14, toHour: 17 },
  stampWindowHours: 2,
  rewardValueCap: null,
  names: {
    upgrade: {
      ro: "Upgrade din partea casei",
      hu: "Ajándék upgrade",
      en: "Upgrade on the house",
    },
    free_coffee: {
      ro: "Cafea din partea casei",
      hu: "Kávé a ház ajándéka",
      en: "Coffee on the house",
    },
    // Kept as noun phrases, not sentences: they are read in a list ("előbb
    // egy extra a háztól, aztán…") and on a button.
    gold_addon: {
      ro: "Un extra din partea casei",
      hu: "Egy extra a háztól",
      en: "One extra on the house",
    },
    gold_coffee: {
      ro: "O cafea în plus din partea casei",
      hu: "Egy plusz kávé a háztól",
      en: "An extra coffee on the house",
    },
    // Deliberately NOT "de ziua ta" in the name: the sentences around it
    // ("De ziua ta: …") already say when, and the name must not repeat it.
    birthday_drink: {
      ro: "O băutură din partea casei",
      hu: "Egy ital a háztól",
      en: "A drink on the house",
    },
  },
  updatedAt: null,
};

/* ------------------------------------------------------------- weekdays --- */

const WEEKDAY_NAMES: RewardText[] = [
  { ro: "duminică", hu: "vasárnap", en: "Sunday" },
  { ro: "luni", hu: "hétfő", en: "Monday" },
  { ro: "marți", hu: "kedd", en: "Tuesday" },
  { ro: "miercuri", hu: "szerda", en: "Wednesday" },
  { ro: "joi", hu: "csütörtök", en: "Thursday" },
  { ro: "vineri", hu: "péntek", en: "Friday" },
  { ro: "sâmbătă", hu: "szombat", en: "Saturday" },
];

/** The recurring form: "marțea" / "kedden" / "Tuesdays". */
const WEEKDAY_RECURRING: RewardText[] = [
  { ro: "duminica", hu: "vasárnap", en: "Sundays" },
  { ro: "lunea", hu: "hétfőn", en: "Mondays" },
  { ro: "marțea", hu: "kedden", en: "Tuesdays" },
  { ro: "miercurea", hu: "szerdán", en: "Wednesdays" },
  { ro: "joia", hu: "csütörtökön", en: "Thursdays" },
  { ro: "vinerea", hu: "pénteken", en: "Fridays" },
  { ro: "sâmbăta", hu: "szombaton", en: "Saturdays" },
];

export function weekdayName(weekday: number): RewardText {
  return WEEKDAY_NAMES[clampInt(weekday, 0, 6, 2)];
}

export function weekdayRecurring(weekday: number): RewardText {
  return WEEKDAY_RECURRING[clampInt(weekday, 0, 6, 2)];
}

/**
 * "Marțea, 14:00 - 17:00: ștampilă dublă" in all three languages, worded from
 * the settings. Null while the mechanic is off — the card and the location
 * page must then say nothing at all, not promise a window that is not live.
 */
export function doubleStampText(config: DoubleStampConfig): RewardText | null {
  if (!config.enabled) return null;
  const day = WEEKDAY_RECURRING[clampInt(config.weekday, 0, 6, 2)];
  const from = hourLabel(config.fromHour);
  const to = hourLabel(config.toHour);
  const roDay = day.ro.charAt(0).toUpperCase() + day.ro.slice(1);
  const huDay = day.hu.charAt(0).toUpperCase() + day.hu.slice(1);
  return {
    ro: `${roDay}, ${from} - ${to}: ștampilă dublă`,
    hu: `${huDay} ${from} - ${to}: dupla pecsét`,
    en: `${day.en}, ${from} - ${to}: double stamp`,
  };
}

/** "Marți, 14:00 - 17:00" — the one place the double-stamp window is worded. */
export function doubleStampWindowLabel(
  config: DoubleStampConfig,
  lang: keyof RewardText,
): string {
  const day = weekdayName(config.weekday)[lang];
  const capitalized = day.charAt(0).toUpperCase() + day.slice(1);
  return `${capitalized}, ${hourLabel(config.fromHour)} - ${hourLabel(config.toHour)}`;
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/* ------------------------------------------------------------ sanitizer --- */

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function text(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed === "" ? fallback : trimmed.slice(0, 80);
}

/**
 * A money amount in lei, or null for "no cap". Anything that is not a
 * positive number turns the cap OFF rather than falling back to a default:
 * an invented cap would silently shrink what customers are owed.
 */
function money(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(Math.min(n, 100_000) * 100) / 100;
}

function isoDate(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fallback;
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return fallback;

  // Date.parse normalizes impossible dates such as 31 February into March;
  // comparing the calendar portion makes those rollovers fail closed.
  return new Date(parsed).toISOString().slice(0, 10) === value
    ? value
    : fallback;
}

function rewardText(value: unknown, fallback: RewardText): RewardText {
  const raw = (value ?? {}) as Partial<RewardText>;
  return {
    ro: text(raw.ro, fallback.ro),
    hu: text(raw.hu, fallback.hu),
    en: text(raw.en, fallback.en),
  };
}

function rotation(value: unknown, fallback: PerkId[]): PerkId[] {
  if (!Array.isArray(value)) return [...fallback];
  const kept = value.filter((id): id is PerkId =>
    PERK_IDS.includes(id as PerkId),
  );
  const unique = [...new Set(kept)];
  return unique.length > 0 ? unique : [...fallback];
}

/**
 * Turns anything (a form post, a stored JSON blob written by an older build)
 * into a usable config. Never throws and never returns a shape that breaks
 * the card: an impossible value falls back to the default rather than to a
 * blank, because this config decides whether a customer gets a free coffee.
 */
export function sanitizeLoyaltyConfig(raw: unknown): LoyaltyConfig {
  const d = DEFAULT_LOYALTY_CONFIG;
  const input = (raw ?? {}) as Partial<LoyaltyConfig>;
  const gold = (input.gold ?? {}) as Partial<GoldConfig>;
  const perks = (gold.perks ?? {}) as Partial<PerkConfig>;
  const double = (input.doubleStamp ?? {}) as Partial<DoubleStampConfig>;
  const mid = (input.midReward ?? {}) as Partial<MidRewardConfig>;
  const birthday = (input.birthday ?? {}) as Partial<BirthdayConfig>;
  const names = (input.names ?? {}) as Partial<Record<RewardId, RewardText>>;

  const requestedCycleLength = clampInt(
    input.cycleLength,
    1,
    30,
    d.cycleLength,
  );
  // A one-stamp standard card leaves no positive length that could make Gold
  // strictly better, so the whole standard length falls back to the safe
  // default instead of leaving a contradictory program.
  const cycleLength =
    requestedCycleLength > 1 ? requestedCycleLength : d.cycleLength;
  const inactivityDays = clampInt(
    gold.inactivityDays,
    1,
    365,
    d.gold.inactivityDays,
  );
  const warningDays = clampInt(
    gold.warningDays,
    0,
    inactivityDays,
    Math.min(d.gold.warningDays, inactivityDays),
  );
  const fallbackGoldCycleLength = Math.min(
    d.gold.cycleLength,
    cycleLength - 1,
  );
  const requestedGoldCycleLength = clampInt(
    gold.cycleLength,
    1,
    30,
    fallbackGoldCycleLength,
  );
  const goldCycleLength =
    requestedGoldCycleLength < cycleLength
      ? requestedGoldCycleLength
      : fallbackGoldCycleLength;
  const fromHour = clampInt(double.fromHour, 0, 23, d.doubleStamp.fromHour);

  return {
    cycleLength,
    midReward: {
      enabled: bool(mid.enabled, d.midReward.enabled),
      // A mid-card reward at or past the end of the card is the free drink
      // itself, so it is pulled back inside the cycle.
      stampsRequired: clampInt(
        mid.stampsRequired,
        1,
        Math.max(1, cycleLength - 1),
        Math.min(d.midReward.stampsRequired, Math.max(1, cycleLength - 1)),
      ),
    },
    gold: {
      enabled: bool(gold.enabled, d.gold.enabled),
      cardsRequired: clampInt(gold.cardsRequired, 1, 50, d.gold.cardsRequired),
      requalifyCards: clampInt(
        gold.requalifyCards,
        1,
        50,
        d.gold.requalifyCards,
      ),
      inactivityDays,
      warningDays,
      cycleLength: goldCycleLength,
      perks: {
        enabled: bool(perks.enabled, d.gold.perks.enabled),
        periodDays: clampInt(perks.periodDays, 1, 365, d.gold.perks.periodDays),
        clock: perks.clock === "personal" ? "personal" : "shared",
        anchorDate: isoDate(perks.anchorDate, d.gold.perks.anchorDate),
        rotation: rotation(perks.rotation, d.gold.perks.rotation),
        toGoOnly: bool(perks.toGoOnly, d.gold.perks.toGoOnly),
      },
    },
    birthday: {
      enabled: bool(birthday.enabled, d.birthday.enabled),
      windowDays: clampInt(birthday.windowDays, 0, 30, d.birthday.windowDays),
    },
    doubleStamp: {
      enabled: bool(double.enabled, d.doubleStamp.enabled),
      weekday: clampInt(double.weekday, 0, 6, d.doubleStamp.weekday),
      fromHour,
      // The window must stay at least one hour wide, otherwise the mechanic is
      // silently off while the copy still promises it.
      toHour: clampInt(double.toHour, fromHour + 1, 24, Math.min(24, fromHour + 3)),
    },
    stampWindowHours: clampInt(input.stampWindowHours, 1, 48, d.stampWindowHours),
    rewardValueCap: money(input.rewardValueCap),
    names: {
      upgrade: rewardText(names.upgrade, d.names.upgrade),
      free_coffee: rewardText(names.free_coffee, d.names.free_coffee),
      gold_addon: rewardText(names.gold_addon, d.names.gold_addon),
      gold_coffee: rewardText(names.gold_coffee, d.names.gold_coffee),
      birthday_drink: rewardText(names.birthday_drink, d.names.birthday_drink),
    },
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : null,
    ...((raw && typeof raw === "object" && "_passRegistrations" in raw)
      ? { _passRegistrations: (raw as any)._passRegistrations }
      : {}),
  };
}
