import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/**
 * The only two secrets-derived values the vote stores. Pure and
 * secret-injected (the caller supplies the key), so tests run without Next.
 *
 * The e-mail itself is never stored: after the code is sent, the address
 * exists only as this keyed hash. HMAC rather than a bare SHA-256 because
 * e-mail addresses are guessable: without the key, a leaked table cannot
 * be checked against a list of known addresses.
 */

/** Takes the NORMALIZED address (lib/drawing-vote.ts normalizeVoterEmail). */
export function hashVoterEmail(normalized: string, secret: string): string {
  return createHmac("sha256", secret).update(`vot-email:${normalized}`).digest("hex");
}

/** Six digits, uniformly random, leading zeros kept. */
export function generateVoteCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Bound to the drawing and the voter: a code sent for R-001 cannot be
 * replayed on R-002, nor by another address.
 */
export function hashVoteCode(
  code: string,
  drawingId: string,
  emailHash: string,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(`vot-cod:${drawingId}:${emailHash}:${code}`)
    .digest("hex");
}

export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/* ------------------------------------------------- verified-voter token --- */

/**
 * After one successful code the browser keeps a signed token carrying the
 * e-mail HASH (never the address), so a second drawing does not need a
 * second e-mail. It grants nothing new: the store still holds one vote per
 * drawing per hash.
 */
export const VOTER_TOKEN_MAX_AGE = 7 * 24 * 60 * 60;

export function sealVoterToken(emailHash: string, secret: string, now: Date = new Date()): string {
  const expires = Math.floor(now.getTime() / 1000) + VOTER_TOKEN_MAX_AGE;
  const body = `${emailHash}.${expires}`;
  const signature = createHmac("sha256", secret).update(`vot-token:${body}`).digest("base64url");
  return `${body}.${signature}`;
}

/** The e-mail hash, or null when the token is forged, malformed or expired. */
export function unsealVoterToken(
  token: string | undefined | null,
  secret: string,
  now: Date = new Date(),
): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [emailHash, expires, signature] = parts;
  if (!/^[0-9a-f]{64}$/.test(emailHash) || !/^\d{1,12}$/.test(expires)) return null;
  const expected = createHmac("sha256", secret)
    .update(`vot-token:${emailHash}.${expires}`)
    .digest("base64url");
  if (!hashesMatch(signature, expected)) return null;
  if (Number(expires) * 1000 <= now.getTime()) return null;
  return emailHash;
}
