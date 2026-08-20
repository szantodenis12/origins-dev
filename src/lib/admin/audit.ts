import "server-only";

import { getDb } from "../db";
import type { StaffSession } from "../db";

/**
 * One place the admin actions write the Jurnal from. The session cookie only
 * carries location + role (+ staffId on personal logins), so the actor's name
 * is resolved here, once, and snapshotted into the row — a later rename must
 * not rewrite history.
 *
 * Never pass a PIN, a hash or a member's phone number in `summary` or
 * `details`. Summaries name people and cafenele, not secrets.
 */
export async function recordAdminAudit(
  session: StaffSession,
  entry: {
    action: string;
    target: string;
    summary: string;
    details?: Record<string, unknown> | null;
  },
): Promise<void> {
  const db = getDb();
  const staff = await db.getStaffForSession(session);
  await db.recordAudit({
    // The session survived readStaffSession, so the row exists; the fallback
    // only covers a deactivation racing this very request.
    staffId: staff?.id ?? null,
    staffName: staff?.name ?? "Cont necunoscut",
    locationSlug: session.locationSlug,
    action: entry.action,
    target: entry.target,
    summary: entry.summary,
    details: entry.details ?? null,
  });
}
