import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The campaign admin panel (the drawings panel on the campaign host) has its
 * own login, separate from the Origins platform admin. Pure, secret-injected
 * helpers so they are tested without Next.
 *
 * Separation from the platform session (lib/admin/session-token.ts) is by
 * construction, not by convention:
 *   - another cookie name, host-only, so the browser never sends one host's
 *     cookie to the other;
 *   - another signing context ("campaign-admin:" is folded into the HMAC),
 *     so a platform token pasted under the campaign cookie name fails the
 *     signature even when both sides share one secret, and the reverse;
 *   - another payload shape (an `aud` field the platform token never has).
 */

export type CampaignRole = "manager" | "staff";

/** One working day at the counter. */
export const CAMPAIGN_SESSION_SECONDS = 60 * 60 * 12;

const CONTEXT = "campaign-admin:";
const AUDIENCE = "campaign-admin";
const VERSION = 1;

function signature(encoded: string, secret: string): string {
  return createHmac("sha256", secret).update(`${CONTEXT}${encoded}`).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sealCampaignSession(
  role: CampaignRole,
  secret: string,
  now: Date = new Date(),
): string {
  const payload = {
    aud: AUDIENCE,
    role,
    version: VERSION,
    expiresAt: now.getTime() + CAMPAIGN_SESSION_SECONDS * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

/** The role, or null when the token is forged, foreign, malformed or expired. */
export function unsealCampaignSession(
  token: string | undefined | null,
  secret: string,
  now: Date = new Date(),
): CampaignRole | null {
  if (!token) return null;
  const [encoded, supplied, extra] = token.split(".");
  if (!encoded || !supplied || extra !== undefined) return null;
  if (!safeEqual(supplied, signature(encoded, secret))) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const { aud, role, version, expiresAt } = parsed as Record<string, unknown>;
    if (
      aud !== AUDIENCE ||
      (role !== "manager" && role !== "staff") ||
      version !== VERSION ||
      typeof expiresAt !== "number" ||
      !Number.isFinite(expiresAt) ||
      now.getTime() >= expiresAt
    ) {
      return null;
    }
    return role;
  } catch {
    return null;
  }
}

export interface CampaignPinEnv {
  CAMPAIGN_ADMIN_PIN_MANAGER?: string;
  CAMPAIGN_ADMIN_PIN_STAFF?: string;
}

/** Development only. Production has NO default: without the env, nobody gets in. */
export const DEV_CAMPAIGN_PINS = { manager: "2222", staff: "3333" } as const;

/**
 * Which role a typed PIN opens. Fails closed: in production a role whose
 * variable is missing (or shorter than four characters) cannot be logged
 * into at all. The manager PIN wins if the two are set to the same value.
 */
export function campaignRoleForPin(
  pin: string,
  env: CampaignPinEnv,
  isProduction: boolean,
): CampaignRole | null {
  const typed = pin.trim();
  if (typed.length < 4) return null;
  const configured = (value: string | undefined, dev: string): string | null => {
    const set = value?.trim();
    if (set && set.length >= 4) return set;
    return isProduction ? null : dev;
  };
  const manager = configured(env.CAMPAIGN_ADMIN_PIN_MANAGER, DEV_CAMPAIGN_PINS.manager);
  const staff = configured(env.CAMPAIGN_ADMIN_PIN_STAFF, DEV_CAMPAIGN_PINS.staff);
  if (manager && safeEqual(typed, manager)) return "manager";
  if (staff && safeEqual(typed, staff)) return "staff";
  return null;
}

/** True when at least one role can be logged into: the login form says so. */
export function campaignLoginAvailable(env: CampaignPinEnv, isProduction: boolean): boolean {
  if (!isProduction) return true;
  return [env.CAMPAIGN_ADMIN_PIN_MANAGER, env.CAMPAIGN_ADMIN_PIN_STAFF].some(
    (value) => (value?.trim().length ?? 0) >= 4,
  );
}
