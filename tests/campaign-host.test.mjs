import assert from "node:assert/strict";
import test from "node:test";

// The campaign subdomain: which requests belong to it, what each path
// means there, and the one public address of a drawing.
import {
  campaignConfigured,
  campaignHost,
  campaignOrigin,
  campaignRoute,
  contestDocLinks,
  drawingAdminScope,
  drawingUrl,
  galleryUrl,
  isCampaignRequest,
  mainRoute,
  outsideRedirect,
} from "../src/lib/campaign-host.ts";
import {
  campaignLoginAvailable,
  campaignRoleForPin,
  sealCampaignSession,
  unsealCampaignSession,
} from "../src/lib/admin/campaign-session-token.ts";
import { sealStaffSession, unsealStaffSession } from "../src/lib/admin/session-token.ts";
import { canChangeDrawingStatus } from "../src/lib/drawing.ts";

const ENV = { CAMPAIGN_HOST: "xmas.originscafe.ro" };

test("campaign host: read from env, tidied, refused when malformed", () => {
  assert.equal(campaignHost({}), null);
  assert.equal(campaignHost({ CAMPAIGN_HOST: "  " }), null);
  assert.equal(campaignHost({ CAMPAIGN_HOST: "https://Xmas.Originscafe.ro/" }), "xmas.originscafe.ro");
  assert.equal(campaignHost({ CAMPAIGN_HOST: "xmas.localhost:4320" }), "xmas.localhost:4320");
  assert.equal(campaignHost({ CAMPAIGN_HOST: "xmas.originscafe.ro/desene" }), null);
  assert.equal(campaignHost({ CAMPAIGN_HOST: "evil.com/@xmas" }), null);
});

test("a request is the campaign's by host, or always under SITE_MODE=campaign", () => {
  assert.equal(isCampaignRequest("xmas.originscafe.ro", ENV), true);
  assert.equal(isCampaignRequest("XMAS.originscafe.ro:443", ENV), true);
  assert.equal(isCampaignRequest("app.originscafe.ro", ENV), false);
  assert.equal(isCampaignRequest("notxmas.originscafe.ro", ENV), false);
  assert.equal(isCampaignRequest("xmas.originscafe.ro.evil.com", ENV), false);
  assert.equal(isCampaignRequest(null, ENV), false);
  // Nothing configured: nothing is the campaign.
  assert.equal(isCampaignRequest("xmas.originscafe.ro", {}), false);
  // A configured port must match (dev: two servers on one machine).
  const dev = { CAMPAIGN_HOST: "xmas.localhost:4320" };
  assert.equal(isCampaignRequest("xmas.localhost:4320", dev), true);
  assert.equal(isCampaignRequest("xmas.localhost:3000", dev), false);
  assert.equal(isCampaignRequest("localhost:4320", dev), false);
  // The second Vercel project: every host, preview URLs included.
  assert.equal(isCampaignRequest("origins-xmas-git-main.vercel.app", { SITE_MODE: "campaign" }), true);
  assert.equal(isCampaignRequest("app.originscafe.ro", { SITE_MODE: "main" }), false);
});

test("campaign routes: the root is the gallery, a code is a drawing", () => {
  assert.deepEqual(campaignRoute("/"), { kind: "rewrite", to: "/desene" });
  assert.deepEqual(campaignRoute("/R-002"), { kind: "rewrite", to: "/desene/R-002" });
  assert.deepEqual(campaignRoute("/e-014"), { kind: "rewrite", to: "/desene/E-014" });
  assert.deepEqual(campaignRoute("/P-001/"), { kind: "rewrite", to: "/desene/P-001" });
  // Not code shapes: they are not drawings.
  for (const path of ["/R-02", "/X-001", "/R-0001", "/R-001/x", "/r001"]) {
    assert.equal(campaignRoute(path).kind, "outside", path);
  }
});

test("campaign routes: contest pages and assets pass, the main app does not exist", () => {
  for (const path of [
    "/desene",
    "/desene/R-002",
    "/desen",
    "/desen/foaie.pdf",
    "/desen/demo/demo-1.jpg",
    "/desene/regulament",
    "/desene/confidentialitate",
    "/_next/static/chunks/app.js",
    "/photos/uploads/desen-r-002-0a1b2c3d.jpg",
    "/cup/cup-blank.jpg",
    "/brand/logo-ink.png",
    "/fonts/Cormorant.ttf",
    "/favicon.ico",
  ]) {
    assert.deepEqual(campaignRoute(path), { kind: "pass" }, path);
  }
  for (const path of [
    "/card",
    "/card/demo-4",
    "/rogerius",
    "/era",
    "/dev/cup",
    "/desenele",
    "/regulament-vechi",
    "/api/anything",
    // The panel's internal tree is not an address, only /admin is.
    "/campanie-admin",
    "/campanie-admin/voturi",
  ]) {
    assert.deepEqual(campaignRoute(path), { kind: "outside" }, path);
  }
});

test("outside paths go to the main app when it is configured, else nowhere", () => {
  assert.equal(outsideRedirect("/card", "", {}), null);
  assert.equal(
    outsideRedirect("/card/demo-4", "?x=1", { MAIN_APP_URL: "https://app.originscafe.ro/" }),
    "https://app.originscafe.ro/card/demo-4?x=1",
  );
  // A malformed target is ignored rather than turned into an open redirect.
  assert.equal(outsideRedirect("/card", "", { MAIN_APP_URL: "javascript:alert(1)" }), null);
  assert.equal(outsideRedirect("/card", "", { MAIN_APP_URL: "https://app.originscafe.ro/x" }), null);
});

test("one public address per drawing: short on the campaign host, long otherwise", () => {
  assert.equal(drawingUrl("R-002", ENV, "https://app.originscafe.ro"), "https://xmas.originscafe.ro/R-002");
  assert.equal(drawingUrl("R-002", {}, "https://app.originscafe.ro"), "https://app.originscafe.ro/desene/R-002");
  assert.equal(drawingUrl("R-002", {}, null), "/desene/R-002");
  // Local names are plain http, everything real is https.
  assert.equal(
    drawingUrl("E-001", { CAMPAIGN_HOST: "xmas.localhost:4320" }, null),
    "http://xmas.localhost:4320/E-001",
  );
  assert.equal(campaignOrigin(ENV), "https://xmas.originscafe.ro");
  assert.equal(campaignOrigin({}), null);
  assert.equal(galleryUrl(ENV, "https://app.originscafe.ro"), "https://xmas.originscafe.ro/");
  assert.equal(galleryUrl({}, "https://app.originscafe.ro"), "https://app.originscafe.ro/desene");
});

/* ------------------------------------------------ the campaign's own admin --- */

test("/admin on the campaign host is the campaign panel, never the Origins admin", () => {
  assert.deepEqual(campaignRoute("/admin"), { kind: "rewrite", to: "/campanie-admin" });
  assert.deepEqual(campaignRoute("/admin/voturi"), { kind: "rewrite", to: "/campanie-admin/voturi" });
  assert.deepEqual(campaignRoute("/admin/voturi/export"), {
    kind: "rewrite",
    to: "/campanie-admin/voturi/export",
  });
  // Origins admin addresses fall into the panel's tree, where they do not exist.
  for (const path of ["/admin/scan", "/admin/meniu", "/admin/statistici", "/admin/desene/voturi"]) {
    const route = campaignRoute(path);
    assert.equal(route.kind, "rewrite", path);
    assert.ok(route.to.startsWith("/campanie-admin/"), path);
  }
  // "/administrator" is not "/admin/...".
  assert.deepEqual(campaignRoute("/administrator"), { kind: "outside" });
});

test("main host: nothing changes until the campaign has a host, then drawings leave", () => {
  // Today: no campaign host, the Origins admin keeps its drawings section.
  assert.equal(campaignConfigured({}), false);
  assert.deepEqual(mainRoute("/admin/desene", {}), { kind: "pass" });
  assert.deepEqual(mainRoute("/admin/desene/voturi", {}), { kind: "pass" });
  assert.equal(drawingAdminScope("app.originscafe.ro", {}), "platform");

  // With a campaign host: the section redirects to the campaign panel.
  assert.equal(campaignConfigured(ENV), true);
  for (const path of ["/admin/desene", "/admin/desene/nou", "/admin/desene/voturi/export"]) {
    assert.deepEqual(mainRoute(path, ENV), {
      kind: "redirect",
      to: "https://xmas.originscafe.ro/admin",
    });
  }
  // The rest of the Origins admin is untouched.
  for (const path of ["/admin", "/admin/scan", "/admin/meniu", "/card", "/desene", "/admin/desenele"]) {
    assert.deepEqual(mainRoute(path, ENV), { kind: "pass" }, path);
  }
  // The panel's internal tree is never reachable on the main host, configured or not.
  for (const env of [{}, ENV]) {
    assert.deepEqual(mainRoute("/campanie-admin", env), { kind: "notfound" });
    assert.deepEqual(mainRoute("/campanie-admin/voturi", env), { kind: "notfound" });
  }
});

test("who administers drawings: one panel per host, never both", () => {
  assert.equal(drawingAdminScope("xmas.originscafe.ro", ENV), "campaign");
  // Main host once the campaign has its own: closed, whatever cookie is sent.
  assert.equal(drawingAdminScope("app.originscafe.ro", ENV), "none");
  assert.equal(drawingAdminScope(null, ENV), "none");
  // The campaign-only deployment: every host is the campaign.
  assert.equal(drawingAdminScope("anything.vercel.app", { SITE_MODE: "campaign" }), "campaign");
});

const SECRET = "test-secret-test-secret-test-secret-0002";

test("a login on one host is rejected on the other, even with a shared secret", () => {
  const now = new Date("2026-11-20T08:00:00Z");
  const campaign = sealCampaignSession("manager", SECRET, now);
  const platform = sealStaffSession({ locationSlug: "rogerius", role: "manager" }, SECRET, now);

  assert.equal(unsealCampaignSession(campaign, SECRET, now), "manager");
  assert.deepEqual(unsealStaffSession(platform, SECRET, now), {
    locationSlug: "rogerius",
    role: "manager",
  });
  // The Origins cookie value under the campaign cookie name, and the reverse.
  assert.equal(unsealCampaignSession(platform, SECRET, now), null);
  assert.equal(unsealStaffSession(campaign, SECRET, now), null);
});

test("campaign session: forged, edited and expired tokens are refused", () => {
  const now = new Date("2026-11-20T08:00:00Z");
  const token = sealCampaignSession("staff", SECRET, now);
  assert.equal(unsealCampaignSession(token, SECRET, now), "staff");
  assert.equal(unsealCampaignSession(token, `${SECRET}-other`, now), null);
  assert.equal(unsealCampaignSession(`${token}x`, SECRET, now), null);
  assert.equal(unsealCampaignSession("", SECRET, now), null);
  assert.equal(unsealCampaignSession(undefined, SECRET, now), null);
  // Staff cannot promote themselves by editing the payload: the signature breaks.
  const [, signature] = token.split(".");
  const promoted = Buffer.from(
    JSON.stringify({ aud: "campaign-admin", role: "manager", version: 1, expiresAt: now.getTime() + 1e9 }),
  ).toString("base64url");
  assert.equal(unsealCampaignSession(`${promoted}.${signature}`, SECRET, now), null);
  // Thirteen hours later the twelve-hour session is over.
  assert.equal(unsealCampaignSession(token, SECRET, new Date(now.getTime() + 13 * 3600_000)), null);
});

test("campaign PINs: dev defaults, production fails closed without them", () => {
  // Development: 2222 manager, 3333 staff.
  assert.equal(campaignRoleForPin("2222", {}, false), "manager");
  assert.equal(campaignRoleForPin("3333", {}, false), "staff");
  assert.equal(campaignRoleForPin("0000", {}, false), null);
  assert.equal(campaignRoleForPin("1111", {}, false), null, "the Origins manager PIN opens nothing here");

  // Production with nothing set: locked, the dev defaults included.
  assert.equal(campaignLoginAvailable({}, true), false);
  for (const pin of ["2222", "3333", "", "0000", "undefined"]) {
    assert.equal(campaignRoleForPin(pin, {}, true), null, pin);
  }

  // Production with the variables.
  const env = { CAMPAIGN_ADMIN_PIN_MANAGER: "918273", CAMPAIGN_ADMIN_PIN_STAFF: "4455" };
  assert.equal(campaignLoginAvailable(env, true), true);
  assert.equal(campaignRoleForPin("918273", env, true), "manager");
  assert.equal(campaignRoleForPin(" 4455 ", env, true), "staff");
  assert.equal(campaignRoleForPin("2222", env, true), null);
  // Only one of the two set: the other role cannot be logged into.
  assert.equal(campaignRoleForPin("3333", { CAMPAIGN_ADMIN_PIN_MANAGER: "918273" }, true), null);
  // A too-short or empty value is not a PIN.
  assert.equal(campaignLoginAvailable({ CAMPAIGN_ADMIN_PIN_STAFF: "12" }, true), false);
  assert.equal(campaignRoleForPin("12", { CAMPAIGN_ADMIN_PIN_STAFF: "12" }, true), null);
  assert.equal(campaignRoleForPin("", { CAMPAIGN_ADMIN_PIN_STAFF: "" }, true), null);
  // Same value for both: the manager PIN wins (documented).
  assert.equal(
    campaignRoleForPin("7777", { CAMPAIGN_ADMIN_PIN_MANAGER: "7777", CAMPAIGN_ADMIN_PIN_STAFF: "7777" }, true),
    "manager",
  );
});

test("staff rights in the panel are the barista rights: no jury selection", () => {
  // The panel maps "staff" to the data layer's "barista" role.
  assert.equal(canChangeDrawingStatus("inregistrat", "depus", "barista"), true);
  assert.equal(canChangeDrawingStatus("depus", "expus", "barista"), true);
  assert.equal(canChangeDrawingStatus("expus", "selectat", "barista"), false);
  assert.equal(canChangeDrawingStatus("expus", "selectat", "manager"), true);
});

/* ------------------------------------------- the contest's own legal pages --- */

test("campaign /regulament is the CONTEST rules, never the Origins Circle rules", () => {
  // The address printed on the A5 sheets resolves to the contest page...
  assert.deepEqual(campaignRoute("/regulament"), { kind: "rewrite", to: "/desene/regulament" });
  assert.deepEqual(campaignRoute("/confidentialitate"), {
    kind: "rewrite",
    to: "/desene/confidentialitate",
  });
  assert.deepEqual(campaignRoute("/regulament/"), { kind: "rewrite", to: "/desene/regulament" });
  // ...and it is never passed through as the app's own /regulament route.
  assert.notDeepEqual(campaignRoute("/regulament"), { kind: "pass" });
  assert.notDeepEqual(campaignRoute("/confidentialitate"), { kind: "pass" });
  // Nothing else under those names exists on the campaign host.
  assert.deepEqual(campaignRoute("/regulament/circle"), { kind: "outside" });
});

test("main host: the Circle rules and the app privacy page are untouched", () => {
  for (const env of [{}, ENV]) {
    assert.deepEqual(mainRoute("/regulament", env), { kind: "pass" });
    assert.deepEqual(mainRoute("/confidentialitate", env), { kind: "pass" });
    // The contest pages have their own main-host routes.
    assert.deepEqual(mainRoute("/desene/regulament", env), { kind: "pass" });
    assert.deepEqual(mainRoute("/desene/confidentialitate", env), { kind: "pass" });
  }
});

test("contest links never point at the Circle pages", () => {
  assert.deepEqual(contestDocLinks({}), {
    rules: "/desene/regulament",
    privacy: "/desene/confidentialitate",
  });
  assert.deepEqual(contestDocLinks(ENV), {
    rules: "https://xmas.originscafe.ro/regulament",
    privacy: "https://xmas.originscafe.ro/confidentialitate",
  });
  for (const env of [{}, ENV, { SITE_MODE: "campaign" }]) {
    const links = contestDocLinks(env);
    assert.notEqual(links.rules, "/regulament");
    assert.notEqual(links.privacy, "/confidentialitate");
  }
});
