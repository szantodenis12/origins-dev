/**
 * Data retention (GDPR spec §7): member data is to be deleted after 24
 * months of inactivity. The cron that deletes belongs to the Supabase phase;
 * until it exists, this module only answers WHO is past the window, so the
 * obligation is visible on Statistici long before anything acts on it.
 *
 * Pure on purpose: rows in, the overdue rows out, tested under `node --test`.
 */

export interface RetentionRow {
  /** Signup date — the floor when the member never used the card. */
  createdAt: string;
  /** Most recent stamp or redemption; null = no activity ever. */
  lastActivityAt: string | null;
}

/** The GDPR spec's proposal: delete after 24 months of inactivity. */
export const RETENTION_MONTHS = 24;

/**
 * Calendar months, not a day count: "24 de luni" in the privacy text means
 * the same date two years later, so the deadline moves with month lengths
 * (31.01 + 1 month lands on 02/03.03 — the overflow is the standard Date
 * behaviour and errs a day or two LATER, never earlier, so nobody becomes
 * deletable ahead of the promised time).
 */
function monthsAfter(iso: string, months: number): number {
  const date = new Date(iso);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.getTime();
}

/**
 * The rows whose retention window has fully run out at `now`: no stamp, no
 * redemption and no signup more recent than `windowMonths` ago. Generic so
 * a caller keeps whatever it attached to the row (member id, name).
 */
export function membersPastRetention<T extends RetentionRow>(
  rows: T[],
  now: Date = new Date(),
  windowMonths: number = RETENTION_MONTHS,
): T[] {
  return rows.filter((row) => {
    const reference = row.lastActivityAt ?? row.createdAt;
    return monthsAfter(reference, windowMonths) <= now.getTime();
  });
}
