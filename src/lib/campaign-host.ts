/**
 * The drawing contest on its own subdomain (name not final: xmas. or
 * craciun.originscafe.ro), so a campaign traffic spike or deploy never
 * touches the main app. Pure rules, no Next imports: src/proxy.ts applies
 * them, the pages build links with them, the tests check them.
 *
 *   CAMPAIGN_HOST   the campaign hostname, e.g. "xmas.originscafe.ro"
 *                   (dev: "xmas.localhost:4320"). Requests on it get the
 *                   campaign routes only; every share link, QR code,
 *                   canonical and og:url uses its short form
 *                   https://{CAMPAIGN_HOST}/R-002.
 *   SITE_MODE       "campaign" makes the WHOLE deployment the campaign
 *                   site, whatever host it is reached on (a second Vercel
 *                   project from the same repo, preview URLs included).
 *   MAIN_APP_URL    where a campaign visitor is sent for anything that is
 *                   not the campaign (menu, card). Unset = 404.
 *
 * With neither CAMPAIGN_HOST nor SITE_MODE set nothing changes anywhere.
 */

export interface CampaignEnv {
  CAMPAIGN_HOST?: string;
  SITE_MODE?: string;
  MAIN_APP_URL?: string;
}

/**
 * The three variables, read one by one: a bundler replaces `process.env.X`
 * where it is written out, and the whole `process.env` object is not
 * something to pass around.
 */
export function campaignEnv(): CampaignEnv {
  return {
    CAMPAIGN_HOST: process.env.CAMPAIGN_HOST,
    SITE_MODE: process.env.SITE_MODE,
    MAIN_APP_URL: process.env.MAIN_APP_URL,
  };
}

/** "https://Xmas.Originscafe.ro/" -> "xmas.originscafe.ro"; null when unset or malformed. */
export function campaignHost(env: CampaignEnv): string | null {
  const raw = env.CAMPAIGN_HOST?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!raw || !/^[a-z0-9.-]+(:\d{1,5})?$/.test(raw)) return null;
  return raw;
}

const stripPort = (host: string) => host.replace(/:\d{1,5}$/, "");

/**
 * Is this request for the campaign site? `host` is the Host header (first
 * value of x-forwarded-host when behind a proxy). A configured host without
 * a port matches any port; with a port it must match exactly.
 */
export function isCampaignRequest(host: string | null, env: CampaignEnv): boolean {
  if (env.SITE_MODE?.trim().toLowerCase() === "campaign") return true;
  const configured = campaignHost(env);
  if (!configured || !host) return false;
  const actual = host.trim().toLowerCase();
  return configured.includes(":") ? actual === configured : stripPort(actual) === configured;
}

export type CampaignRoute =
  /** Serve another path under this URL (the address bar keeps the short one). */
  | { kind: "rewrite"; to: string }
  /** A campaign page or asset as it is. */
  | { kind: "pass" }
  /** Not part of the campaign: the main app's business (menu, card, its admin). */
  | { kind: "outside" };

/** The internal route tree of the campaign's own admin panel. */
export const CAMPAIGN_ADMIN_INTERNAL = "/campanie-admin";

/** Pages of the campaign site, besides the gallery itself. */
const CAMPAIGN_PAGES = ["/desene", "/desen"];

/**
 * The contest's own rules and privacy note (content/concurs/*.md). On the
 * main host they live under /desene; on the campaign host they are simply
 * /regulament and /confidentialitate, the addresses printed on the sheets.
 * The main host's /regulament and /confidentialitate are something else:
 * the Origins Circle loyalty rules and the app's privacy page.
 */
export const CONTEST_DOC_PATHS = {
  regulament: "/desene/regulament",
  confidentialitate: "/desene/confidentialitate",
} as const;
/** Static files the campaign pages load from /public. */
const CAMPAIGN_ASSETS = ["/_next/", "/photos/", "/desen/", "/cup/", "/brand/", "/fonts/"];

/**
 * What a path means on the campaign host:
 *   /            the gallery
 *   /R-002       that drawing (any case, with or without the dash padding)
 *   /desene...   the same pages under their long names (links inside the app)
 *   /desen       registration
 *   /regulament, /confidentialitate
 *                the CONTEST rules and privacy note (not the Circle ones)
 *   /admin...    the campaign's OWN admin panel (drawings only), served
 *                from the internal tree /campanie-admin. The Origins
 *                platform admin does not exist here: /admin/scan,
 *                /admin/meniu and the rest land in that tree and 404.
 *   assets       passed through
 *   the rest     outside: no menu, no card, no locations
 */
export function campaignRoute(pathname: string): CampaignRoute {
  if (pathname === "/") return { kind: "rewrite", to: "/desene" };

  // The contest rules and privacy note, never the Circle ones.
  if (pathname === "/regulament" || pathname === "/regulament/") {
    return { kind: "rewrite", to: CONTEST_DOC_PATHS.regulament };
  }
  if (pathname === "/confidentialitate" || pathname === "/confidentialitate/") {
    return { kind: "rewrite", to: CONTEST_DOC_PATHS.confidentialitate };
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return { kind: "rewrite", to: `${CAMPAIGN_ADMIN_INTERNAL}${pathname.slice("/admin".length)}` };
  }
  // The internal name is not an address: only /admin reaches the panel.
  if (pathname === CAMPAIGN_ADMIN_INTERNAL || pathname.startsWith(`${CAMPAIGN_ADMIN_INTERNAL}/`)) {
    return { kind: "outside" };
  }

  const short = pathname.match(/^\/([repREP])-(\d{3})\/?$/);
  if (short) return { kind: "rewrite", to: `/desene/${short[1].toUpperCase()}-${short[2]}` };

  if (CAMPAIGN_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`))) {
    return { kind: "pass" };
  }
  // The campaign host's own robots.txt and sitemap (src/app/robots.ts, sitemap.ts).
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml") return { kind: "pass" };
  if (pathname === "/favicon.ico" || CAMPAIGN_ASSETS.some((prefix) => pathname.startsWith(prefix))) {
    return { kind: "pass" };
  }
  return { kind: "outside" };
}

/** Where an "outside" path goes: the same path on the main app, or nowhere. */
export function outsideRedirect(pathname: string, search: string, env: CampaignEnv): string | null {
  const main = env.MAIN_APP_URL?.trim().replace(/\/+$/, "");
  if (!main || !/^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(main)) return null;
  return `${main}${pathname}${search}`;
}

/** http for local names, https for everything real. */
function schemeFor(host: string): string {
  const name = stripPort(host);
  return name === "localhost" || name.endsWith(".localhost") || /^127\./.test(name) ? "http" : "https";
}

/** "https://xmas.originscafe.ro", or null when no campaign host is configured. */
export function campaignOrigin(env: CampaignEnv): string | null {
  const host = campaignHost(env);
  return host ? `${schemeFor(host)}://${host}` : null;
}

/**
 * The one public address of a drawing: what is shared, printed on the
 * poster, encoded in the QR and declared as canonical. Short on the
 * campaign host; the long /desene/CODE on `fallbackOrigin` (APP_URL or the
 * request's own origin) when there is no campaign host.
 */
export function drawingUrl(code: string, env: CampaignEnv, fallbackOrigin: string | null): string {
  const campaign = campaignOrigin(env);
  if (campaign) return `${campaign}/${code}`;
  return `${fallbackOrigin ?? ""}/desene/${code}`;
}

/** The gallery's public address, same rule. */
export function galleryUrl(env: CampaignEnv, fallbackOrigin: string | null): string {
  const campaign = campaignOrigin(env);
  return campaign ? `${campaign}/` : `${fallbackOrigin ?? ""}/desene`;
}

/**
 * The canonical address of a campaign page, from its SHORT path as the
 * campaign host serves it ("/", "/R-002", "/desen", "/regulament",
 * "/confidentialitate"). With a campaign host: that host plus the path.
 * Without one: the same page under its long name on `fallbackOrigin`
 * ("/" -> "/desene", "/R-002" -> "/desene/R-002", "/regulament" ->
 * "/desene/regulament"). Null when there is no origin at all.
 */
export function campaignCanonical(
  path: string,
  env: CampaignEnv,
  fallbackOrigin: string | null,
): string | null {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const campaign = campaignOrigin(env);
  if (campaign) return clean === "/" ? `${campaign}/` : `${campaign}${clean}`;
  if (!fallbackOrigin) return null;
  const route = campaignRoute(clean);
  const long = route.kind === "rewrite" ? route.to : clean;
  return `${fallbackOrigin}${long}`;
}

/* ------------------------------------------------------------- main host --- */

/** True when the contest has (or is) its own site: CAMPAIGN_HOST or SITE_MODE=campaign. */
export function campaignConfigured(env: CampaignEnv): boolean {
  return campaignHost(env) !== null || env.SITE_MODE?.trim().toLowerCase() === "campaign";
}

export type MainRoute =
  | { kind: "pass" }
  | { kind: "notfound" }
  | { kind: "redirect"; to: string };

/**
 * What a path means on the MAIN host (the Origins platform):
 *   - the campaign panel's internal tree is never reachable here;
 *   - once the campaign has its own host, the drawings section leaves the
 *     Origins admin: /admin/desene... goes to the campaign panel;
 *   - with nothing configured, everything is as it was.
 */
export function mainRoute(pathname: string, env: CampaignEnv): MainRoute {
  if (pathname === CAMPAIGN_ADMIN_INTERNAL || pathname.startsWith(`${CAMPAIGN_ADMIN_INTERNAL}/`)) {
    return { kind: "notfound" };
  }
  if (
    campaignConfigured(env) &&
    (pathname === "/admin/desene" || pathname.startsWith("/admin/desene/"))
  ) {
    const origin = campaignOrigin(env);
    return origin ? { kind: "redirect", to: `${origin}/admin` } : { kind: "notfound" };
  }
  return { kind: "pass" };
}

/**
 * Who administers the drawings for this request:
 *   "campaign"  the campaign panel's own login (campaign host)
 *   "platform"  the Origins staff session (main host, nothing configured)
 *   "none"      main host while the campaign has its own: the drawings
 *               section is closed there, whatever cookie is presented
 */
export function drawingAdminScope(
  host: string | null,
  env: CampaignEnv,
): "campaign" | "platform" | "none" {
  if (isCampaignRequest(host, env)) return "campaign";
  return campaignConfigured(env) ? "none" : "platform";
}

/**
 * Where every contest link to the rules and to the privacy note points:
 * the campaign host's short addresses when it is configured (the same ones
 * printed on the A5 sheets), the main-host routes under /desene otherwise.
 * Never the Origins Circle pages.
 */
export function contestDocLinks(env: CampaignEnv): { rules: string; privacy: string } {
  const origin = campaignOrigin(env);
  return origin
    ? { rules: `${origin}/regulament`, privacy: `${origin}/confidentialitate` }
    : { rules: CONTEST_DOC_PATHS.regulament, privacy: CONTEST_DOC_PATHS.confidentialitate };
}
