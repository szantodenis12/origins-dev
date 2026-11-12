import "server-only";

import { headers } from "next/headers";
import { campaignNow, campaignPhase, type CampaignPhase, type CampaignState } from "./campaign-phase";
import type { CampaignEventProps, ServerEvent } from "./campaign-metrics";
import { getDb } from "./db";
import { createRateLimiter, type RateLimiter } from "./rate-limit";

/**
 * Server plumbing shared by every campaign server function: the phase of
 * this request, the shared rate limiter and the server-side events. The
 * decisions themselves are pure (lib/campaign-guards.ts).
 */

export interface CampaignMoment {
  now: Date;
  state: CampaignState;
  phase: CampaignPhase;
}

/** `campaignPhase(campaignNow(), state)`: the one way a server function reads the calendar. */
export async function campaignMoment(): Promise<CampaignMoment> {
  const now = campaignNow();
  const state = await getDb().getCampaignState();
  return { now, state, phase: campaignPhase(now, state) };
}

/** The client address as the proxy reports it; "local" straight on the box. */
export async function requestAddress(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip")?.trim() || "local";
}

const FALLBACK = Symbol.for("origins.campaign-rate-fallback.v1");

/**
 * The shared fixed-window limiter (`Db.rateLimitHit`: every instance counts
 * together on Supabase). If the store cannot answer, the request falls back
 * to a per-instance counter with the same limit instead of failing: a
 * limiter outage must not close the contest, and must not open it wide
 * either. Prefix the key ("desen-ip:…") so limiters never share a counter.
 */
export async function rateLimitAllow(
  key: string,
  options: { limit: number; windowMs: number },
): Promise<boolean> {
  try {
    return await getDb().rateLimitHit(key, options);
  } catch {
    const host = globalThis as typeof globalThis & { [FALLBACK]?: Map<string, RateLimiter> };
    host[FALLBACK] ??= new Map();
    const name = `${key.split(":")[0]}:${options.limit}:${options.windowMs}`;
    let limiter = host[FALLBACK].get(name);
    if (!limiter) {
      limiter = createRateLimiter(options);
      host[FALLBACK].set(name, limiter);
    }
    return limiter.allow(key);
  }
}

/**
 * Records a server event. Only the whitelisted props of
 * lib/campaign-metrics.ts reach the store (the adapter sanitizes again):
 * never a name, a phone, an e-mail or an id. Measurement never breaks the
 * action it measures: a failure is logged (the event name only) and dropped.
 */
export async function recordServerEvent(
  name: ServerEvent,
  props: CampaignEventProps = {},
): Promise<void> {
  try {
    await getDb().recordCampaignEvent({
      name,
      ...(props.location ? { location: props.location } : {}),
      ...(props.channel ? { channel: props.channel } : {}),
      ...(props.category ? { category: props.category } : {}),
      ...(props.method ? { method: props.method } : {}),
    });
  } catch {
    console.error(`[masurare] evenimentul ${name} nu s-a putut salva`);
  }
}
