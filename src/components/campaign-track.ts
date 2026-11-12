"use client";

import { trackCampaignEventAction } from "@/app/desene/metrics-actions";

/**
 * Browser side of the first-party campaign counts (lib/campaign-metrics.ts).
 * Only the four client events, only slug props (location, channel,
 * category, method): never a name, phone, e-mail or drawing code. No
 * cookie, no third-party script. Best effort: a failed call is dropped.
 *
 * The acquisition channel (`?ch=` or `utm_source` on the landing URL) is
 * kept for the tab's session so later events on other pages carry it too.
 */

type ClientEvent = "instructions_view" | "prereg_start" | "share" | "map_click";

const CHANNEL_KEY = "origins-xmas-ch";
const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** "?ch=afis-era" / "?utm_source=facebook" -> a safe slug, or null. */
export function channelFrom(search: string): string | null {
  const params = new URLSearchParams(search);
  const raw = (params.get("ch") ?? params.get("utm_source") ?? "").trim().toLowerCase();
  return SLUG.test(raw) && !/\d{6,}/.test(raw) ? raw : null;
}

/** Remembers the landing channel for this tab; returns the current one. */
export function rememberChannel(): string | null {
  try {
    const fresh = channelFrom(window.location.search);
    if (fresh) window.sessionStorage.setItem(CHANNEL_KEY, fresh);
    return fresh ?? window.sessionStorage.getItem(CHANNEL_KEY);
  } catch {
    return channelFrom(window.location.search);
  }
}

export function trackEvent(
  name: ClientEvent,
  props: { location?: string; category?: string; method?: string } = {},
): void {
  const channel = rememberChannel();
  try {
    void Promise.resolve(
      trackCampaignEventAction(name, channel ? { ...props, channel } : props),
    ).catch(() => {});
  } catch {
    // Measurement never breaks the page.
  }
}
