import { createHmac, timingSafeEqual } from "node:crypto";
import type { StaffRole, StaffSession } from "../db";

/** Pure signed-token helpers, kept separate so they can be tested without Next. */

const TOKEN_VERSION = 1;
const SESSION_SECONDS = 60 * 60 * 12;
const ROLES: StaffRole[] = ["barista", "manager"];

interface StaffSessionPayload extends StaffSession {
  version: number;
  expiresAt: number;
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sealStaffSession(
  session: StaffSession,
  secret: string,
  now: Date = new Date(),
): string {
  const payload: StaffSessionPayload = {
    ...session,
    version: TOKEN_VERSION,
    expiresAt: now.getTime() + SESSION_SECONDS * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

export function unsealStaffSession(
  token: string,
  secret: string,
  now: Date = new Date(),
): StaffSession | null {
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra !== undefined) return null;
  if (!safeEqual(suppliedSignature, signature(encoded, secret))) return null;

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    );
    if (typeof parsed !== "object" || parsed === null) return null;

    const { locationSlug, role, staffId, version, expiresAt } = parsed as Record<
      string,
      unknown
    >;
    if (
      typeof locationSlug !== "string" ||
      !locationSlug ||
      typeof role !== "string" ||
      !ROLES.includes(role as StaffRole) ||
      version !== TOKEN_VERSION ||
      typeof expiresAt !== "number" ||
      !Number.isFinite(expiresAt) ||
      now.getTime() >= expiresAt
    ) {
      return null;
    }

    const session: StaffSession = {
      locationSlug,
      role: role as StaffRole,
    };
    if (typeof staffId === "string" && staffId) session.staffId = staffId;
    return session;
  } catch {
    return null;
  }
}

export const STAFF_SESSION_MAX_AGE = SESSION_SECONDS;
