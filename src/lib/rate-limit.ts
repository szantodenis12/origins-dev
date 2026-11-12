/**
 * Fixed-window counter per key, in memory. Enough for a public form on one
 * instance: it stops a script from registering a hundred drawings a minute
 * without any infrastructure. On several instances each one counts on its
 * own, which only makes the limit looser, never a lockout.
 *
 * Pure apart from the Map it owns: `now` is injected so tests drive the clock.
 */
export interface RateLimiter {
  /** True when the call is allowed and counted; false when over the limit. */
  allow(key: string, now?: Date): boolean;
}

export function createRateLimiter(options: {
  /** Calls allowed per key inside one window. */
  limit: number;
  windowMs: number;
}): RateLimiter {
  const hits = new Map<string, { windowStart: number; count: number }>();

  return {
    allow(key: string, now: Date = new Date()): boolean {
      const t = now.getTime();
      const entry = hits.get(key);
      if (!entry || t - entry.windowStart >= options.windowMs) {
        // Sweep stale keys so an idle instance does not grow forever.
        if (hits.size > 5000) {
          for (const [k, v] of hits) {
            if (t - v.windowStart >= options.windowMs) hits.delete(k);
          }
        }
        hits.set(key, { windowStart: t, count: 1 });
        return true;
      }
      if (entry.count >= options.limit) return false;
      entry.count += 1;
      return true;
    },
  };
}
