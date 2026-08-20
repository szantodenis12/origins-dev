import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "../db";
import type { StaffRole, StaffSession } from "../db";
import {
  sealStaffSession,
  STAFF_SESSION_MAX_AGE,
  unsealStaffSession,
} from "./session-token";

/**
 * Dev-only staff session.
 *
 * Phase 3/5 replaces all of this with Supabase Auth (email + password, roles
 * on `staff_users`, RLS on every table). Until the project exists there is no
 * user store to authenticate against, so the admin is gated by a shared PIN
 * from the environment plus the location the phone sits at. It is deliberately
 * thin: the cookie is signed and role-checked on every request, but PINs are
 * still only a temporary local/demo gate. Nothing behind it exposes personal
 * data beyond the demo members in the memory adapter.
 */

export const STAFF_COOKIE = "origins_staff";

const DEV_SECRET_KEY = Symbol.for("origins.admin-session-secret.v1");

/**
 * Production must provide one stable secret to keep sessions valid across
 * instances. Local development gets a process-random secret: convenient,
 * but never forgeable from the documented demo PINs.
 */
function sessionSecret(): string {
  const configured = process.env.ADMIN_SESSION_SECRET?.trim();
  if (configured && Buffer.byteLength(configured) >= 32) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ADMIN_SESSION_SECRET trebuie setat în producție (minimum 32 de caractere).",
    );
  }

  const host = globalThis as typeof globalThis & { [DEV_SECRET_KEY]?: string };
  host[DEV_SECRET_KEY] ??= randomBytes(32).toString("base64url");
  return host[DEV_SECRET_KEY];
}

export function devPin(): string | null {
  const configured = process.env.ADMIN_DEV_PIN?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? null : "0000";
}

/** Separate PIN unlocks the manager tools (meniu, push, statistici). */
export function managerPin(): string | null {
  const configured = process.env.ADMIN_MANAGER_PIN?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? null : "1111";
}

/** Manager PIN wins if the two are misconfigured to the same value. */
export function roleForPin(pin: string): StaffRole | null {
  const manager = managerPin();
  const barista = devPin();
  if (manager && pin === manager) return "manager";
  if (barista && pin === barista) return "barista";
  return null;
}

/**
 * Locations a barista phone can actually be at — read from the store, not from
 * the seed module: a cafenea added from the menu editor must appear here too,
 * otherwise the codes handed to its baristas never log in anywhere.
 */
export async function staffLocations() {
  return (await getDb().listLocations()).filter(
    (location) => !location.comingSoon,
  );
}

export async function readStaffSession(): Promise<StaffSession | null> {
  const store = await cookies();
  const raw = store.get(STAFF_COOKIE)?.value;
  if (!raw) return null;

  const session = unsealStaffSession(raw, sessionSecret());
  if (!session) return null;

  // Any existing cafenea keeps the shift alive: a manager who ticks a location
  // back to "în curând" must not lock the phones out of the counter screen.
  const known = new Set((await getDb().listLocations()).map((l) => l.slug));
  if (!known.has(session.locationSlug)) return null;

  // A signed cookie proves integrity, not that the staff row/role is still
  // active. Re-read it on every request, close to the data mutation.
  const staff = await getDb().getStaffForSession(session);
  if (!staff || staff.role !== session.role) return null;
  return session;
}

/** Manager-only pages: null means redirect (to /admin or /admin/scan). */
export async function readManagerSession(): Promise<StaffSession | null> {
  const session = await readStaffSession();
  return session?.role === "manager" ? session : null;
}

/** Only callable from a Server Function or Route Handler. */
export async function writeStaffSession(session: StaffSession): Promise<void> {
  const store = await cookies();
  store.set(STAFF_COOKIE, sealStaffSession(session, sessionSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STAFF_SESSION_MAX_AGE, // one shift
    priority: "high",
  });
}

export async function clearStaffSession(): Promise<void> {
  const store = await cookies();
  store.delete(STAFF_COOKIE);
}
