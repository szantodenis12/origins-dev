import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Pure PIN-hashing helpers, same shape as session-token.ts: no `server-only`
 * because the memory adapter (imported directly by `node --test`) uses them.
 *
 * A 4-digit code has 10.000 possibilities, so any unkeyed hash would fall to
 * a laptop in milliseconds. The pepper IS the secret: without it a leaked
 * `staff_pins` dump verifies nothing, and with HMAC-SHA256 we add no
 * dependency beyond node:crypto, which the project already uses.
 */

const DEV_PEPPER_KEY = Symbol.for("origins.staff-pin-pepper.v1");

/**
 * Production must provide one stable pepper, or every deploy would silently
 * invalidate all personal codes. Local development gets a process-random
 * pepper — same trade-off as `sessionSecret()` in session.ts.
 */
function pepper(): string {
  const configured = process.env.STAFF_PIN_PEPPER?.trim();
  if (configured && Buffer.byteLength(configured) >= 32) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "STAFF_PIN_PEPPER trebuie setat în producție (minimum 32 de caractere).",
    );
  }

  const host = globalThis as typeof globalThis & { [DEV_PEPPER_KEY]?: string };
  host[DEV_PEPPER_KEY] ??= randomBytes(32).toString("base64url");
  return host[DEV_PEPPER_KEY];
}

/** What the store keeps instead of the code. Deterministic per process. */
export function hashStaffPin(pin: string): string {
  return createHmac("sha256", pepper()).update(pin).digest("base64url");
}

export function verifyStaffPin(pin: string, storedHash: string): boolean {
  const a = Buffer.from(hashStaffPin(pin));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The shared env codes (dev 0000, manager 1111) no personal code may take.
 * Login checks them first, so a personal code equal to one of them would
 * never be reached — the person would silently start the shift on the shared
 * account and scan stamps that land on nobody.
 */
export function reservedPins(): Set<string> {
  return new Set(
    [
      process.env.ADMIN_DEV_PIN ?? "0000",
      process.env.ADMIN_MANAGER_PIN ?? "1111",
    ].map((pin) => pin.trim()),
  );
}

/**
 * A random 4-digit personal code: never a reserved one, never one `taken`
 * already answers for at that cafenea. Both adapters generate through here so
 * the two cannot drift on what counts as a free code.
 *
 * With 10.000 codes and a handful of people per cafenea the loop finds one
 * immediately; the cap only stops it spinning if a cafenea ever held most of
 * the space, in which case the caller gets to say so instead of hanging.
 */
export function generateStaffPin(taken: (pin: string) => boolean): string | null {
  const reserved = reservedPins();
  for (let attempt = 0; attempt < 2000; attempt += 1) {
    const pin = String(randomBytes(2).readUInt16BE(0) % 10000).padStart(4, "0");
    if (reserved.has(pin)) continue;
    if (!taken(pin)) return pin;
  }
  return null;
}
