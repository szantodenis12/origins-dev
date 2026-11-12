import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  campaignEnv,
  campaignRoute,
  isCampaignRequest,
  mainRoute,
  outsideRedirect,
} from "@/lib/campaign-host";
import {
  isMemberId,
  MEMBER_COOKIE,
  MEMBER_COOKIE_MAX_AGE,
} from "@/lib/member-cookie";

/** Per-visitor seed for the drawing gallery order (lib/drawing-vote.ts). */
const GALLERY_SEED_COOKIE = "origins_galerie";
const GALLERY_SEED_HEADER = "x-origins-galerie";

/**
 * Three small jobs.
 *
 * 1. The campaign host (lib/campaign-host.ts). On CAMPAIGN_HOST, or
 *    everywhere when SITE_MODE=campaign, only the contest exists: "/" is
 *    the gallery, "/R-002" is a drawing, plus registration, the rules, the
 *    privacy page and their assets. "/admin" there is the campaign's own
 *    drawings panel (internal tree /campanie-admin), never the Origins
 *    admin. Anything else is redirected to the main app (MAIN_APP_URL) or
 *    answered with 404.
 *    Server-function POSTs go to the page's own URL, so they follow the
 *    same rewrite as the page.
 *
 * 2. The gallery seed. The order of the gallery is random but must stay
 *    the same for one visitor, and a Server Component cannot set the cookie
 *    that remembers it. So the seed is drawn here: stored in a cookie for
 *    the next visits and passed along in a request header for this one (the
 *    cookie is not in the request yet the first time). It identifies
 *    nobody: 32 random bits that only shuffle a grid. Host-only cookie, so
 *    the campaign host keeps its own.
 *
 * 3. The member card. Remember, on this device, which card was opened
 *    here (see below). Main app only.
 */

/** The Host the visitor typed: the proxy's forwarded one first, then the direct one. */
function requestHost(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("host");
}

/**
 * A rewritten request can come through the proxy a second time, now under
 * its internal path. The campaign panel's internal tree is refused as an
 * address, so that second pass has to be recognised: the first pass stamps
 * the request with a token only this process knows. A visitor cannot send
 * it, because it is drawn at start-up and never leaves the server.
 */
const REWRITE_HEADER = "x-origins-rewritten";
const REWRITE_TOKEN = crypto.randomUUID();

/** Continue (or rewrite), drawing a gallery seed first when the visitor has none. */
function withGallerySeed(request: NextRequest, rewriteTo: string | null): NextResponse {
  const existing = request.cookies.get(GALLERY_SEED_COOKIE)?.value;
  const hasSeed = existing !== undefined && /^\d{1,10}$/.test(existing);

  const headers = new Headers(request.headers);
  const seed = hasSeed ? null : String(crypto.getRandomValues(new Uint32Array(1))[0]);
  if (seed) headers.set(GALLERY_SEED_HEADER, seed);
  if (rewriteTo) headers.set(REWRITE_HEADER, REWRITE_TOKEN);

  const init = { request: { headers } };
  const response = rewriteTo
    ? NextResponse.rewrite(new URL(rewriteTo + request.nextUrl.search, request.url), init)
    : NextResponse.next(init);

  if (seed) {
    response.cookies.set({
      name: GALLERY_SEED_COOKIE,
      value: seed,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      // "/" so the short drawing links on the campaign host read it too.
      path: "/",
      maxAge: 60 * 24 * 60 * 60,
    });
  }
  return response;
}

const isGalleryPath = (pathname: string) => pathname === "/desene";

function rewriteInternal(request: NextRequest, target: string): NextResponse {
  const headers = new Headers(request.headers);
  headers.set(REWRITE_HEADER, REWRITE_TOKEN);
  return NextResponse.rewrite(new URL(target + request.nextUrl.search, request.url), {
    request: { headers },
  });
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Second pass of our own rewrite: already decided, let it through.
  if (request.headers.get(REWRITE_HEADER) === REWRITE_TOKEN) return NextResponse.next();

  if (isCampaignRequest(requestHost(request), campaignEnv())) {
    const route = campaignRoute(pathname);
    if (route.kind === "outside") {
      const target = outsideRedirect(pathname, search, campaignEnv());
      return target
        ? NextResponse.redirect(target, 307)
        : new NextResponse(null, { status: 404 });
    }
    const target = route.kind === "rewrite" ? route.to : null;
    // The gallery under either of its names gets the seed.
    return isGalleryPath(target ?? pathname)
      ? withGallerySeed(request, target)
      : target
        ? rewriteInternal(request, target)
        : NextResponse.next();
  }

  // Main host. The campaign panel's internal tree does not exist here, and
  // once the campaign has its own host the drawings section leaves this admin.
  const main = mainRoute(pathname, campaignEnv());
  if (main.kind === "notfound") return new NextResponse(null, { status: 404 });
  if (main.kind === "redirect") return NextResponse.redirect(main.to, 307);

  if (isGalleryPath(pathname)) return withGallerySeed(request, null);

  /*
   * The member card. A cookie cannot be set while a Server Component
   * renders (Next 16: `.set` only in a Server Function or a Route Handler),
   * and /card/{memberId} is a plain page. This runs in front of it, so the
   * card is remembered on the first visit, with no client JavaScript and no
   * extra roundtrip. The cookie is rewritten on every visit on purpose: the
   * year runs from the member's last look at their card, not from signup.
   */
  const response = NextResponse.next();
  const segments = pathname.split("/");
  // "/card/{memberId}", one segment only: /card itself (signup) must not match.
  if (segments.length !== 3 || segments[1] !== "card") return response;
  const memberId = segments[2] ?? "";
  if (!isMemberId(memberId)) return response;

  response.cookies.set({
    name: MEMBER_COOKIE,
    value: memberId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MEMBER_COOKIE_MAX_AGE,
  });

  return response;
}

export const config = {
  // Every page and route: the campaign host must be able to refuse any
  // path. Next's own static files and images skip the proxy.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
