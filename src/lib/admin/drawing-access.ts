import "server-only";

import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { campaignEnv, drawingAdminScope } from "../campaign-host";
import { contestLocationForStaff, type DrawingLocation } from "../drawing";
import { getDb } from "../db";
import type { StaffRole, StaffSession } from "../db";
import { createRateLimiter, type RateLimiter } from "../rate-limit";
import {
  CAMPAIGN_SESSION_SECONDS,
  sealCampaignSession,
  unsealCampaignSession,
  type CampaignRole,
} from "./campaign-session-token";
import { readStaffSession } from "./session";

/**
 * Who may work on the drawings in this request. One question, asked by every
 * drawings server function and route, so the logic exists once and the two
 * panels cannot drift apart:
 *
 *   campaign host   -> the campaign panel's own cookie and PINs
 *   main host       -> the Origins staff session, but only while the
 *                      campaign has no host of its own; afterwards nobody
 *
 * A login on one host never works on the other: the cookies have different
 * names, are host-only, are signed in different contexts, and each is read
 * only on its own host (lib/admin/campaign-session-token.ts).
 */

export const CAMPAIGN_ADMIN_COOKIE = "campanie_admin";

export interface DrawingAccess {
  /** "barista" is the campaign panel's "staff": same rights on drawings. */
  role: StaffRole;
  scope: "platform" | "campaign";
  /** The Origins session behind it; null in the campaign panel. */
  platform: StaffSession | null;
}

const DEV_SECRET = Symbol.for("origins.campaign-admin-secret.v1");

/**
 * Signs the campaign panel cookie. Its own variable, or the platform's
 * session secret when only that one is set (the signing context differs, so
 * sharing the secret does not make the tokens interchangeable). Production
 * without either: no session can be made or read, the panel stays locked.
 */
function campaignSecret(): string | null {
  for (const value of [process.env.CAMPAIGN_ADMIN_SECRET, process.env.ADMIN_SESSION_SECRET]) {
    const set = value?.trim();
    if (set && Buffer.byteLength(set) >= 32) return set;
  }
  if (process.env.NODE_ENV === "production") return null;
  const host = globalThis as typeof globalThis & { [DEV_SECRET]?: string };
  host[DEV_SECRET] ??= randomBytes(32).toString("base64url");
  return host[DEV_SECRET];
}

async function requestHost(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host");
}

/** The campaign panel session of this request; null off the campaign host. */
export async function readCampaignRole(): Promise<CampaignRole | null> {
  if (drawingAdminScope(await requestHost(), campaignEnv()) !== "campaign") return null;
  const secret = campaignSecret();
  if (!secret) return null;
  return unsealCampaignSession((await cookies()).get(CAMPAIGN_ADMIN_COOKIE)?.value, secret);
}

export async function readDrawingAccess(): Promise<DrawingAccess | null> {
  const scope = drawingAdminScope(await requestHost(), campaignEnv());
  if (scope === "none") return null;
  if (scope === "campaign") {
    const role = await readCampaignRole();
    return role
      ? { role: role === "manager" ? "manager" : "barista", scope, platform: null }
      : null;
  }
  const platform = await readStaffSession();
  return platform ? { role: platform.role, scope, platform } : null;
}

/** Only callable from a Server Function or Route Handler. False = locked. */
export async function writeCampaignSession(role: CampaignRole): Promise<boolean> {
  const secret = campaignSecret();
  if (!secret) return false;
  (await cookies()).set(CAMPAIGN_ADMIN_COOKIE, sealCampaignSession(role, secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // No `domain`: the cookie belongs to the campaign host alone.
    path: "/",
    maxAge: CAMPAIGN_SESSION_SECONDS,
  });
  return true;
}

export async function clearCampaignSession(): Promise<void> {
  (await cookies()).delete(CAMPAIGN_ADMIN_COOKIE);
}

const LIMITER = Symbol.for("origins.campaign-admin-login-limit.v1");

/** Ten PIN tries per address per quarter of an hour. */
export async function campaignLoginAllowed(): Promise<boolean> {
  const host = globalThis as typeof globalThis & { [LIMITER]?: RateLimiter };
  host[LIMITER] ??= createRateLimiter({ limit: 10, windowMs: 15 * 60_000 });
  const h = await headers();
  const address =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "local";
  return host[LIMITER].allow(address);
}

/**
 * A platform barista works on the drawings of their own café; the manager
 * and the campaign panel (whose staff PIN is shared by the three cafés) on
 * all of them.
 */
export function accessMayTouch(access: DrawingAccess, location: DrawingLocation): boolean {
  if (access.role === "manager" || access.scope === "campaign") return true;
  return (
    access.platform !== null &&
    contestLocationForStaff(access.platform.locationSlug) === location
  );
}

/**
 * The Jurnal row for a drawings action, from either panel. Same rule as
 * lib/admin/audit.ts: never a PIN, a hash, a name of a child or a phone.
 */
export async function recordDrawingAudit(
  access: DrawingAccess,
  entry: {
    action: string;
    target: string;
    summary: string;
    details?: Record<string, unknown> | null;
  },
): Promise<void> {
  const db = getDb();
  if (access.platform) {
    const staff = await db.getStaffForSession(access.platform);
    await db.recordAudit({
      staffId: staff?.id ?? null,
      staffName: staff?.name ?? "Cont necunoscut",
      locationSlug: access.platform.locationSlug,
      action: entry.action,
      target: entry.target,
      summary: entry.summary,
      details: entry.details ?? null,
    });
    return;
  }
  // The campaign panel has shared PINs, not people: the row says which role.
  await db.recordAudit({
    staffId: null,
    staffName: access.role === "manager" ? "Panoul desenelor · manager" : "Panoul desenelor · echipă",
    locationSlug: "campanie",
    action: entry.action,
    target: entry.target,
    summary: entry.summary,
    details: entry.details ?? null,
  });
}
