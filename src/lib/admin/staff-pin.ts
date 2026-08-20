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
