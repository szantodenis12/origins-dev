import "server-only";

import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { rateLimitAllow } from "./campaign-server";
import { unsealVoterToken } from "./vote-hash";

/**
 * Server-side plumbing of the public vote: the secret, the limiters and the
 * verified-voter cookie. Rules are in lib/drawing-vote.ts, hashing in
 * lib/vote-hash.ts.
 */

export const VOTER_COOKIE = "origins_votant";

const DEV_SECRET = Symbol.for("origins.vote-secret.v1");

/**
 * Keys the e-mail hashes, the code hashes and the voter cookie. It must stay
 * the same for the whole contest: change it and every stored hash stops
 * matching, so the same person could vote again. Production refuses to
 * start voting without it; development gets a per-process random one (the
 * memory store resets at the same moment, so nothing goes stale).
 */
export function voteSecret(): string {
  const configured = process.env.VOTE_HASH_SECRET?.trim();
  if (configured && Buffer.byteLength(configured) >= 32) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "VOTE_HASH_SECRET trebuie setat în producție (minimum 32 de caractere).",
    );
  }
  const host = globalThis as typeof globalThis & { [DEV_SECRET]?: string };
  host[DEV_SECRET] ??= randomBytes(32).toString("base64url");
  return host[DEV_SECRET];
}

/**
 * The vote limits, same numbers as before, now counted in the shared store
 * (lib/campaign-server.ts `rateLimitAllow`: every instance together on
 * Supabase, a per-instance fallback if the store cannot answer).
 *   sendPerIp     code e-mails per address: café Wi-Fi and mobile NAT share addresses
 *   sendPerEmail  code e-mails per mailbox (keyed hash), so no inbox is flooded from here
 *   confirmPerIp  code checks and one-tap votes per address
 */
export const VOTE_LIMITS = {
  sendPerIp: { limit: 20, windowMs: 60 * 60_000 },
  sendPerEmail: { limit: 5, windowMs: 60 * 60_000 },
  confirmPerIp: { limit: 120, windowMs: 60 * 60_000 },
} as const;

export async function voteLimitAllow(
  kind: keyof typeof VOTE_LIMITS,
  key: string,
): Promise<boolean> {
  return rateLimitAllow(`vote-${kind}:${key}`, VOTE_LIMITS[kind]);
}

/** The client address as the proxy reports it; "local" straight on the box. */
export async function clientAddress(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip")?.trim() || "local";
}

/** The e-mail hash this browser already verified, or null. */
export async function readVerifiedVoter(): Promise<string | null> {
  const store = await cookies();
  return unsealVoterToken(store.get(VOTER_COOKIE)?.value, voteSecret());
}
