/**
 * The app's own public origin, resolved from the incoming request.
 *
 * Needed wherever the server hands out a link meant to leave the screen it
 * was built on — today the QR a barista shows a member who lost their card.
 * Vercel puts the public host in `x-forwarded-host`; `host` is the direct
 * one and the only header present under `next dev`.
 */

/** Just enough of the Headers API to resolve an origin (and to test it). */
export interface OriginHeaders {
  get(name: string): string | null;
}

/** Proxies may append to these headers: the first entry is the client's. */
function first(value: string | null): string | null {
  if (!value) return null;
  const head = value.split(",")[0].trim();
  return head.length > 0 ? head : null;
}

/**
 * `configured` (env APP_URL) wins, for the day the app sits behind a host it
 * cannot see. Null when no host is available at all — the caller decides what
 * to do about it, rather than getting a link to nowhere.
 */
export function appOrigin(
  headers: OriginHeaders,
  configured?: string,
  isProduction = true,
): string | null {
  const explicit = configured?.trim().replace(/\/+$/, "");
  if (explicit) return explicit;

  const host = first(headers.get("x-forwarded-host")) ?? first(headers.get("host"));
  // A Host header is client input: anything but a hostname[:port] is dropped
  // instead of being pasted into a URL we then print on a QR.
  if (!host || !/^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host)) return null;

  const proto = first(headers.get("x-forwarded-proto"));
  const scheme =
    proto === "http" || proto === "https"
      ? proto
      : isProduction
        ? "https"
        : "http";

  return `${scheme}://${host}`;
}

/** The member's web card, absolute — what the QR at the counter carries. */
export function cardUrl(origin: string, memberId: string): string {
  return `${origin}/card/${memberId}`;
}
