import { getDb } from "../db";
import { memberCard } from "../card";
import type { GoldStatus, PerkPeriod } from "../gold";
import { memberHistory } from "../history";
import { isDoubleStamp, stampWindow, type RewardId } from "../loyalty";
import { doubleStampWindowLabel, PERK_IDS, type PerkId } from "../program";
import { formatLei } from "../program-copy";

/**
 * Everything the barista screen shows about one member, already resolved on
 * the server. Plain data: it crosses the server function boundary.
 */
export interface MemberPanel {
  memberId: string;
  name: string;
  passSerial: string;
  isStudent: boolean;
  studentVerified: boolean;
  reviewBonusGiven: boolean;
  reviewIntentAt: string | null;
  /** Stamps on the current card, double stamps already counted twice. */
  progress: number;
  cycleLength: number;
  totalStamps: number;
  rewards: { id: RewardId; name: string; toGoOnly: boolean }[];
  /** "25,00 lei" — the value cap on rewards; null while no cap is set. */
  rewardValueCapLabel: string | null;
  /** Derived Gold status (lib/gold.ts) — recomputed on every panel build. */
  gold: GoldStatus;
  /** The Gold perk of the current period; null when not Gold or disabled. */
  perk: (PerkPeriod & { name: string; usedAt: string | null }) | null;
  /** Bucharest clock says the next stamp counts double. Decided server side. */
  doubleStamp: boolean;
  /** "Marți, 14:00 - 17:00" — worded from the settings, not hardcoded. */
  doubleWindowLabel: string;
  /** Set while a second stamp at this location would be refused. */
  blockedUntil: string | null;
  lastStampAt: string | null;
  locationSlug: string;
  /** Manager freeze (Db.setMemberBlocked): the card earns nothing while set. */
  blockedAt: string | null;
  /**
   * Promotional consent, shown so the manager can withdraw it on request.
   * Null = never given or already withdrawn; the button hides either way.
   */
  marketingConsentAt: string | null;
  /**
   * The last 20 events, newest first — the dispute trail at the till.
   * Slugs and staff ids already resolved to names; null = name unknown.
   */
  history: PanelHistoryEntry[];
}

export interface PanelHistoryEntry {
  /** ISO 8601 — the panel formats it for Bucharest. */
  at: string;
  /** "Ștampilă", "Ștampilă dublă", or the reward name from the config. */
  label: string;
  locationName: string;
  staffName: string | null;
}

export interface PanelNotice {
  tone: "success" | "info";
  text: string;
}

export type PanelResult =
  | { ok: true; panel: MemberPanel; notice?: PanelNotice }
  | { ok: false; reason: "unauthorized" | "not_found" | "invalid" | "failed" };

/**
 * QR payloads may arrive as a bare serial or as a pass URL ending in one.
 * Normalise both to "ORIG-DEMO-0001".
 */
export function normalizeSerial(raw: string): string {
  const trimmed = raw.trim();
  const withoutQuery = trimmed.split(/[?#]/)[0];
  const lastSegment = withoutQuery.split("/").filter(Boolean).pop() ?? "";
  return lastSegment.toUpperCase();
}

export async function buildPanel(
  memberId: string,
  locationSlug: string,
  now: Date = new Date(),
): Promise<MemberPanel | null> {
  const db = getDb();
  const member = await db.getMember(memberId);
  if (!member) return null;

  const config = await db.getLoyaltyConfig();
  const stamps = await db.getMemberStamps(member.id);
  const redemptions = await db.getMemberRedemptions(member.id);

  // The history is worded by lib/history.ts; here the slugs and staff ids
  // become the names a barista can read out loud at the till.
  const [locations, staff] = await Promise.all([db.listLocations(), db.listStaff()]);
  const locationName = new Map(locations.map((l) => [l.slug, l.name]));
  const staffName = new Map(staff.map((s) => [s.id, s.name]));
  const history = memberHistory(stamps, redemptions, config).map((entry) => ({
    at: entry.at,
    label: entry.label,
    locationName: locationName.get(entry.locationSlug) ?? entry.locationSlug,
    staffName: entry.staffId !== null ? (staffName.get(entry.staffId) ?? null) : null,
  }));

  const card = memberCard(stamps, redemptions, config, now, {
    day: member.birthDay,
    month: member.birthMonth,
    year: member.birthYear,
  });
  const window = stampWindow(
    stamps,
    locationSlug,
    now,
    config.stampWindowHours,
  );

  return {
    memberId: member.id,
    name: member.name,
    passSerial: member.passSerial,
    isStudent: member.isStudent,
    studentVerified: member.studentVerifiedAt !== null,
    reviewBonusGiven: member.reviewBonusGiven,
    reviewIntentAt: member.reviewIntentAt,
    progress: card.progress,
    cycleLength: card.spec.cycleLength,
    totalStamps: card.totalStamps,
    gold: card.gold,
    perk: card.perk
      ? {
          ...card.perk.period,
          name: config.names[card.perk.period.perk].ro,
          usedAt: card.perk.usedAt,
        }
      : null,
    rewards: card.rewards.map((reward) => ({
      id: reward.id,
      name: reward.name.ro,
      // Roland 07.08.2026: the Gold perks are handed over only at takeaway.
      // Matched by id, not by stampsRequired: the birthday drink also sits at
      // zero stamps and is not takeaway-bound.
      toGoOnly:
        PERK_IDS.includes(reward.id as PerkId) && config.gold.perks.toGoOnly,
    })),
    rewardValueCapLabel:
      config.rewardValueCap !== null
        ? `${formatLei(config.rewardValueCap)} lei`
        : null,
    doubleStamp: isDoubleStamp(now, config.doubleStamp),
    doubleWindowLabel: doubleStampWindowLabel(config.doubleStamp, "ro"),
    blockedUntil: window.nextAllowedAt,
    lastStampAt: window.lastStampAt,
    locationSlug,
    blockedAt: member.blockedAt,
    marketingConsentAt: member.marketingConsentAt,
    history,
  };
}
