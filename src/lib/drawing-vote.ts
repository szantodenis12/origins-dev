import { DRAWING_CATEGORIES, VOTE_CLOSES_AT } from "./drawing.ts";
import type { DrawingCategory } from "./drawing.ts";

/**
 * Public vote of the drawing contest: the pure rules. No I/O, no crypto, so
 * the public pages, the server functions, the admin table and the tests all
 * read the same answers. Hashing lives next door (lib/vote-hash.ts).
 *
 * The fixed points (client, 10.11.2026):
 *   - one vote per drawing per verified e-mail; several drawings are fine
 *   - winner per age group = most votes PER DAY ONLINE, not most votes
 *   - counts are never public (see lib/drawing.ts `PublicDrawing`)
 */

/* -------------------------------------------------------------- e-mail --- */

/** Providers where dots in the local part do not make a different mailbox. */
const DOTLESS_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * One mailbox, one spelling: lowercase, trimmed, "+tag" dropped, Gmail dots
 * dropped and googlemail.com folded into gmail.com. Returns null when it is
 * not an address shape at all. This is what gets hashed, so
 * "Ana.Pop+vot@Gmail.com" and "anapop@gmail.com" are the same voter.
 */
export function normalizeVoterEmail(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (value.length > 254) return null;
  const match = value.match(/^([a-z0-9._%+-]{1,64})@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/);
  if (!match) return null;

  let local = match[1].split("+")[0];
  let domain = match[2];
  if (domain === "googlemail.com") domain = "gmail.com";
  if (DOTLESS_DOMAINS.has(domain)) local = local.replaceAll(".", "");
  if (local.length === 0 || local.startsWith(".") || local.endsWith(".")) return null;
  if (domain.split(".").some((part) => part.length === 0 || part.startsWith("-"))) {
    return null;
  }
  return `${local}@${domain}`;
}

/**
 * Throwaway inboxes: short on purpose, the ones people actually reach for.
 * A determined cheater has other doors; this closes the one-click one, and
 * the anomaly flag below shows the manager the rest.
 */
export const DISPOSABLE_EMAIL_DOMAINS = [
  "10minutemail.com",
  "10minutemail.net",
  "dispostable.com",
  "emailondeck.com",
  "fakeinbox.com",
  "getnada.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "minuteinbox.com",
  "mohmal.com",
  "sharklasers.com",
  "temp-mail.org",
  "tempmail.com",
  "tempmailo.com",
  "throwawaymail.com",
  "trashmail.com",
  "yopmail.com",
];

/** Takes a NORMALIZED address; subdomains of a listed domain count too. */
export function isDisposableEmail(normalized: string): boolean {
  const domain = normalized.slice(normalized.lastIndexOf("@") + 1);
  return DISPOSABLE_EMAIL_DOMAINS.some(
    (listed) => domain === listed || domain.endsWith(`.${listed}`),
  );
}

/* ---------------------------------------------------------------- code --- */

export const VOTE_CODE_LENGTH = 6;
export const VOTE_CODE_TTL_MS = 15 * 60_000;
/** Wrong tries allowed on one code before it is dead. */
export const VOTE_CODE_MAX_ATTEMPTS = 5;

/** "12 34 56" / "123-456" -> "123456"; null when it is not six digits. */
export function normalizeVoteCode(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

/* --------------------------------------------------------------- clock --- */

/**
 * The UTC instant of a Bucharest wall-clock time, DST included, without a
 * date library: guess UTC, ask Intl what Bucharest shows at that instant,
 * correct by the difference.
 */
export function bucharestInstant(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bucharest",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(wanted));
  const n = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const shown = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"));
  return new Date(wanted - (shown - wanted));
}

/** True while votes are accepted: up to and including 03.12.2026 23:59 Bucharest. */
export function votingOpen(now: Date = new Date()): boolean {
  return now.getTime() < new Date(VOTE_CLOSES_AT).getTime();
}

/* ------------------------------------------------------------- ranking --- */

const DAY_MS = 24 * 60 * 60_000;

/**
 * Days a drawing has been collecting votes: from publishing to the close
 * (or to `now` while the vote is still running), fractional, never under
 * one day. The floor keeps a drawing published an hour before the close
 * from winning with three votes.
 */
export function daysOnline(publishedAt: string, now: Date = new Date()): number {
  const end = Math.min(now.getTime(), new Date(VOTE_CLOSES_AT).getTime());
  const days = (end - new Date(publishedAt).getTime()) / DAY_MS;
  return Math.max(1, days);
}

export function votesPerDay(
  votes: number,
  publishedAt: string,
  now: Date = new Date(),
): number {
  return votes / daysOnline(publishedAt, now);
}

export interface VoteStanding {
  id: string;
  code: string;
  category: DrawingCategory;
  publishedAt: string;
  votes: number;
}

export interface RankedStanding extends VoteStanding {
  daysOnline: number;
  votesPerDay: number;
  /** 1-based; drawings with the same rate share the position. */
  position: number;
  /** Shares its position with at least one other drawing. */
  tied: boolean;
}

/** Two rates this close are the same rate (float noise from the division). */
const RATE_EPSILON = 1e-9;

/**
 * One age group, best rate first. Equal rates share a position and are both
 * marked `tied`: the manager decides a tie, the code never does. Inside a
 * tie the order is only for a stable screen (code, ascending) and carries
 * no meaning.
 */
export function rankStandings(
  standings: VoteStanding[],
  now: Date = new Date(),
): RankedStanding[] {
  const rated = standings
    .map((s) => ({
      ...s,
      daysOnline: daysOnline(s.publishedAt, now),
      votesPerDay: votesPerDay(s.votes, s.publishedAt, now),
    }))
    .sort(
      (a, b) =>
        b.votesPerDay - a.votesPerDay ||
        a.code.localeCompare(b.code),
    );

  const ranked: RankedStanding[] = [];
  for (const [index, row] of rated.entries()) {
    const previous = ranked[index - 1];
    const same =
      previous !== undefined &&
      Math.abs(previous.votesPerDay - row.votesPerDay) < RATE_EPSILON;
    ranked.push({
      ...row,
      position: same ? previous.position : index + 1,
      tied: same,
    });
    if (same) previous.tied = true;
  }
  return ranked;
}

/** Every age group ranked on its own. */
export function rankByCategory(
  standings: VoteStanding[],
  now: Date = new Date(),
): Record<DrawingCategory, RankedStanding[]> {
  const result = {} as Record<DrawingCategory, RankedStanding[]>;
  for (const category of DRAWING_CATEGORIES) {
    result[category] = rankStandings(
      standings.filter((s) => s.category === category),
      now,
    );
  }
  return result;
}

/* ------------------------------------------------------------- anomaly --- */

export const BURST_WINDOW_MS = 30 * 60_000;
export const BURST_THRESHOLD = 10;

export interface VoteRecord {
  drawingId: string;
  emailHash: string;
  createdAt: string;
}

/**
 * The simple alarm the manager sees: for each drawing, the largest number
 * of votes from FIRST-TIME e-mails (addresses that had never voted for
 * anything before that vote) landing inside one 30-minute window. Ten or
 * more is flagged. It removes nothing: a class WhatsApp group produces the
 * same shape as a script, and only a person can tell them apart.
 */
export function voteBursts(votes: VoteRecord[]): Map<string, number> {
  const sorted = [...votes].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const seen = new Set<string>();
  const fresh = new Map<string, number[]>();
  for (const vote of sorted) {
    if (!seen.has(vote.emailHash)) {
      seen.add(vote.emailHash);
      const times = fresh.get(vote.drawingId) ?? [];
      times.push(new Date(vote.createdAt).getTime());
      fresh.set(vote.drawingId, times);
    }
  }

  const bursts = new Map<string, number>();
  for (const [drawingId, times] of fresh) {
    let best = 0;
    let start = 0;
    for (let end = 0; end < times.length; end += 1) {
      while (times[end] - times[start] > BURST_WINDOW_MS) start += 1;
      best = Math.max(best, end - start + 1);
    }
    bursts.set(drawingId, best);
  }
  return bursts;
}

export function burstIsSuspicious(burst: number): boolean {
  return burst >= BURST_THRESHOLD;
}

/* ------------------------------------------------------ gallery order --- */

/** Small deterministic PRNG (mulberry32): same seed, same sequence. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Gallery order: random, but the same for one visitor on every load (the
 * seed sits in a cookie). Never by votes: a "popular first" order would be
 * a ranking, and it would also feed itself. Items are sorted by code first
 * so the result depends on the seed alone, not on how the store listed them.
 */
export function stableShuffle<T extends { code: string }>(items: T[], seed: number): T[] {
  const result = [...items].sort((a, b) => a.code.localeCompare(b.code));
  const random = prng(seed);
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** A cookie value back into a seed; null when it is not one of ours. */
export function parseGallerySeed(value: string | undefined | null): number | null {
  if (!value || !/^\d{1,10}$/.test(value)) return null;
  const seed = Number(value);
  return seed <= 0xffffffff ? seed : null;
}
