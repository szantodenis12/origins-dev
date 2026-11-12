import assert from "node:assert/strict";
import test from "node:test";

// The campaign store: env selection, composition (loyalty untouched,
// campaign routed), fail-closed production, the memory adapter against the
// shared contract, and the Supabase adapters' requests with a fake fetch.
// Fake data only; no network.
import {
  CAMPAIGN_METHODS,
  CampaignStoreUnavailableError,
  campaignBackend,
  composeDb,
  createDb,
  createUnavailableCampaignStore,
} from "../src/lib/db/compose.ts";
import { createMemoryDb } from "../src/lib/db/memory.ts";
import { createSupabaseCampaignStore, supabaseAuthHeaders } from "../src/lib/db/supabase.ts";
import { createSupabaseDrawingFileStore } from "../src/lib/storage/supabase-drawings.ts";
import { isOriginalKey, isPublicDrawingPath, publicDrawingFileName } from "../src/lib/drawing-image.ts";
import { runCampaignContract } from "./campaign-contract.mjs";

const KEY = "aaa.bbb.ccc";

/* ------------------------------------------------------------ selection --- */

test("backend: Supabase only with both variables, memory only outside production", () => {
  assert.deepEqual(campaignBackend({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" }), {
    kind: "supabase",
    url: "https://x.supabase.co",
    serviceRoleKey: "k",
  });
  assert.deepEqual(campaignBackend({ NODE_ENV: "development" }), { kind: "memory" });
  assert.deepEqual(campaignBackend({ NODE_ENV: "test" }), { kind: "memory" });
  assert.deepEqual(campaignBackend({}), { kind: "memory" });
  assert.equal(campaignBackend({ NODE_ENV: "production" }).kind, "unavailable");
  // half a configuration is a mistake everywhere, never a silent fallback
  assert.equal(campaignBackend({ NODE_ENV: "development", SUPABASE_URL: "https://x.supabase.co" }).kind, "unavailable");
  assert.equal(campaignBackend({ SUPABASE_SERVICE_ROLE_KEY: "k" }).kind, "unavailable");
  assert.equal(campaignBackend({ NODE_ENV: "production", SUPABASE_URL: " ", SUPABASE_SERVICE_ROLE_KEY: "" }).kind, "unavailable");
});

test("CAMPAIGN_METHODS covers the drawing methods and no loyalty method", () => {
  for (const name of [
    "createDrawingEntry", "listDrawingEntries", "setDrawingStatus", "publishDrawing",
    "redeemVoteCode", "castVote", "setDrawingVoteWinner", "deleteDrawingEntries",
    "markDrawingSubmitted", "setDrawingWinner", "setWinnerAccepted", "setReserveRank",
    "getCampaignState", "updateCampaignState", "recordCampaignEvent", "listCampaignEvents", "rateLimitHit",
  ]) {
    assert.ok(CAMPAIGN_METHODS.includes(name), name);
  }
  for (const name of ["createMember", "addStamp", "listLocations", "recordAudit", "listAudit", "getStats", "findStaffByPin"]) {
    assert.ok(!CAMPAIGN_METHODS.includes(name), name);
  }
});

/* ---------------------------------------------------------- composition --- */

test("compose: loyalty methods are the memory adapter's, campaign methods the store's", async () => {
  const memory = createMemoryDb();
  const calls = [];
  const fake = {};
  for (const name of CAMPAIGN_METHODS) {
    fake[name] = async (...args) => {
      calls.push(name);
      return name === "listDrawingEntries" ? [{ id: "x1" }] : { routed: name, args };
    };
  }
  const redacted = [];
  const db = composeDb(memory, fake, { redactAudit: (ids) => redacted.push([...ids]) });

  for (const name of Object.keys(memory)) {
    if (!CAMPAIGN_METHODS.includes(name)) assert.equal(db[name], memory[name], name);
  }
  for (const name of CAMPAIGN_METHODS) assert.notEqual(db[name], memory[name], name);

  assert.deepEqual(await db.publishDrawing("id-1"), { routed: "publishDrawing", args: ["id-1"] });
  assert.deepEqual(await db.getCampaignState(), { routed: "getCampaignState", args: [] });
  // loyalty still answers from memory
  assert.ok((await db.listLocations()).length > 0);
  assert.ok(!calls.includes("listLocations"));

  // end of campaign with a separate store: the Jurnal (memory) is redacted too
  await db.deleteDrawingEntries();
  assert.deepEqual(calls.slice(-2), ["listDrawingEntries", "deleteDrawingEntries"]);
  assert.deepEqual(redacted, [["x1"]]);
});

test("compose with Supabase: the Jurnal rows about deleted drawings are redacted", async () => {
  const memory = createMemoryDb();
  const id = "11111111-1111-4111-8111-111111111111";
  await memory.recordAudit({
    staffId: null,
    staffName: "Test",
    locationSlug: "era",
    action: "desene.status",
    target: id,
    summary: "E-001 a fost depus.",
    details: { code: "E-001" },
  });
  const { redactDrawingAudit } = await import("../src/lib/db/memory.ts");
  const fake = Object.fromEntries(CAMPAIGN_METHODS.map((n) => [n, async () => null]));
  fake.listDrawingEntries = async () => [{ id }];
  fake.deleteDrawingEntries = async () => ({ deleted: 1 });
  const db = composeDb(memory, fake, { redactAudit: redactDrawingAudit });
  assert.deepEqual(await db.deleteDrawingEntries(), { deleted: 1 });
  const [row] = await db.listAudit({ limit: 1 });
  assert.equal(row.target, "desen-sters");
  assert.ok(!row.summary.includes("E-001"));
  assert.equal(row.details ?? null, null);
});

test("production without Supabase: campaign fails closed, loyalty keeps working", async () => {
  const db = createDb({ NODE_ENV: "production" });
  assert.ok((await db.listLocations()).length > 0);
  assert.ok(await db.getLoyaltyConfig());
  for (const name of CAMPAIGN_METHODS) {
    await assert.rejects(() => db[name]("x"), (error) => {
      assert.ok(error instanceof CampaignStoreUnavailableError, name);
      assert.match(error.message, /nu este configurată/);
      assert.match(error.message, /SUPABASE_URL/);
      return true;
    });
  }
  const store = createUnavailableCampaignStore("test");
  await assert.rejects(() => store.createDrawingEntry({}), CampaignStoreUnavailableError);
});

test("dev/test without Supabase: the campaign is the memory adapter", async () => {
  const db = createDb({ NODE_ENV: "test" });
  const memory = createMemoryDb();
  const created = await db.createDrawingEntry({
    location: "rogerius", childFirstName: "Ana", childAge: 5, parentName: "Părinte Test",
    phone: "0700000001", consentParticipation: true, consentReproduction: false,
    attribution: "none", consentPhoto: false, circleOptIn: false, registeredVia: "web",
  });
  assert.equal(created.status, "created");
  // same singleton store: visible through a plain memory adapter too
  assert.equal((await memory.getDrawingEntry(created.entry.id)).code, created.entry.code);
  await db.deleteDrawingEntries();
});

/* --------------------------------------------------- memory: the contract --- */

test("memory adapter satisfies the campaign contract", async (t) => {
  await runCampaignContract(t, createMemoryDb());
});

test("memory: no demo drawings outside `next dev` (tests run with an empty contest)", async () => {
  const db = createMemoryDb();
  const all = await db.listDrawingEntries();
  assert.ok(all.every((e) => !e.id.startsWith("demo-")));
});

/* ------------------------------------------------ Supabase: request shape --- */

function fakeFetch(handler) {
  const requests = [];
  const fn = async (url, init = {}) => {
    const request = { url: String(url), method: init.method ?? "GET", headers: init.headers ?? {}, body: init.body };
    requests.push(request);
    const { status = 200, body = null } = (await handler(request)) ?? {};
    const text = typeof body === "string" ? body : body === null ? "" : JSON.stringify(body);
    return new Response(text || null, { status });
  };
  return { fn, requests };
}

test("supabase adapter: service-role headers, RPC for atomic creation, mapped rows", async () => {
  const row = {
    id: "22222222-2222-4222-8222-222222222222", code: "P-007", location: "palatul-copiilor",
    child_first_name: "Ana", child_age: 9, category: "6-9", parent_name: "Părinte Test",
    phone: "0700000002", consent_participation: true, consent_reproduction: true,
    attribution: "first-name-age", consent_photo: false, consent_gallery: true, circle_opt_in: false,
    status: "inregistrat", image_original: null, image_web: null, image_width: null, image_height: null,
    cup_mockup: null, published_at: null, unpublished_at: null, vote_winner: false, sheet_kind: null,
    submitted_at: null, submitted_by: null, winner_kind: null, winner_accepted_at: null, reserve_rank: null,
    registered_via: "web", registered_by: null,
    created_at: "2026-11-16T09:00:00.123456+00:00", updated_at: "2026-11-16T09:00:00.123456+00:00",
  };
  const { fn, requests } = fakeFetch(() => ({ body: row }));
  const store = createSupabaseCampaignStore({ url: "https://proj.supabase.co/", serviceRoleKey: KEY, fetch: fn });
  const result = await store.createDrawingEntry({
    location: "palatul-copiilor", childFirstName: " Ana ", childAge: 9, parentName: "Părinte Test",
    phone: "0700 000 002", consentParticipation: true, consentReproduction: true, consentGallery: true,
    attribution: "first-name-age", consentPhoto: false, circleOptIn: false, registeredVia: "web",
  });
  assert.equal(result.status, "created");
  assert.equal(result.entry.code, "P-007");
  assert.equal(result.entry.createdAt, "2026-11-16T09:00:00.123Z");
  assert.equal(result.entry.registeredBy, undefined);
  const [req] = requests;
  assert.equal(req.url, "https://proj.supabase.co/rest/v1/rpc/create_drawing_entry");
  assert.equal(req.method, "POST");
  assert.equal(req.headers.apikey, KEY);
  assert.equal(req.headers.Authorization, `Bearer ${KEY}`);
  const sent = JSON.parse(req.body).p;
  assert.equal(sent.child_first_name, "Ana");
  assert.equal(sent.phone, "0700000002");
  assert.equal(sent.code, undefined, "the code is never chosen by the client");

  // validation happens before any request
  const before = requests.length;
  assert.equal((await store.createDrawingEntry({ ...JSON.parse("{}"), consentParticipation: false })).status, "consent_required");
  assert.equal(requests.length, before);
});

test("supabase adapter: new secret keys go in apikey only; errors surface", async () => {
  assert.deepEqual(supabaseAuthHeaders("sb_secret_abc"), { apikey: "sb_secret_abc" });
  const { fn } = fakeFetch(() => ({ status: 500, body: { code: "XX000", message: "boom" } }));
  const store = createSupabaseCampaignStore({ url: "https://proj.supabase.co", serviceRoleKey: "sb_secret_abc", fetch: fn });
  await assert.rejects(() => store.listDrawingEntries(), /500 boom/);
  // a non-uuid id never reaches PostgREST
  const { fn: never, requests } = fakeFetch(() => ({ body: [] }));
  const quiet = createSupabaseCampaignStore({ url: "https://proj.supabase.co", serviceRoleKey: KEY, fetch: never });
  assert.equal(await quiet.getDrawingEntry("demo-desen-1"), null);
  assert.deepEqual(await quiet.castVote({ drawingId: "demo-desen-1", emailHash: "a".repeat(64) }), { status: "not_live" });
  assert.equal(requests.length, 0);
});

test("supabase adapter: list queries page past the 1000-row cap", async () => {
  const { fn, requests } = fakeFetch((req) => {
    const from = Number(req.headers.Range.split("-")[0]);
    const count = from === 0 ? 1000 : 3;
    return {
      body: Array.from({ length: count }, (_, i) => ({
        entry_id: "33333333-3333-4333-8333-333333333333",
        email_hash: "b".repeat(64),
        created_at: new Date(Date.UTC(2026, 10, 20) + from + i).toISOString(),
      })),
    };
  });
  const store = createSupabaseCampaignStore({ url: "https://proj.supabase.co", serviceRoleKey: KEY, fetch: fn });
  assert.equal((await store.listDrawingVotes()).length, 1003);
  assert.deepEqual(requests.map((r) => r.headers.Range), ["0-999", "1000-1999"]);
});

/* --------------------------------------------------- Supabase Storage files --- */

test("public drawing paths: local and Supabase Storage URLs, nothing else", () => {
  const url = "https://proj.supabase.co/storage/v1/object/public/desene-public/desen-r-001-0a1b2c3d.jpg";
  assert.equal(isPublicDrawingPath("/photos/uploads/pahar-e-012-0a1b2c3d.png"), true);
  assert.equal(isPublicDrawingPath(url), true);
  assert.equal(isPublicDrawingPath("http://127.0.0.1:54480/storage/v1/object/public/desene-public/pahar-p-003-0a1b2c3d.jpg"), true);
  assert.equal(publicDrawingFileName(url), "desen-r-001-0a1b2c3d.jpg");
  for (const bad of [
    "https://proj.supabase.co/storage/v1/object/desene-originale/r-001-0a1b2c3d.jpg",
    "https://proj.supabase.co/storage/v1/object/public/desene-public/../x/desen-r-001-0a1b2c3d.jpg",
    "https://proj.supabase.co/storage/v1/object/public/desene-public/desen-r-001-0a1b2c3d.jpg?x=1",
    "/photos/uploads/../desen-r-001-0a1b2c3d.jpg",
    "javascript:alert(1)//storage/v1/object/public/a/desen-r-001-0a1b2c3d.jpg",
  ]) {
    assert.equal(isPublicDrawingPath(bad), false, bad);
  }
  assert.equal(isOriginalKey("r-001-0a1b2c3d.heic"), true);
});

test("supabase storage: originals private, public files as public URLs, deletes scoped", async () => {
  const { fn, requests } = fakeFetch((req) => {
    if (req.method === "GET") return { body: "JPEGBYTES" };
    return { body: { Key: "ok" } };
  });
  const files = createSupabaseDrawingFileStore({ url: "https://proj.supabase.co", serviceRoleKey: KEY, fetch: fn });
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

  const key = await files.saveOriginal({ bytes, type: "jpeg", code: "R-001" });
  assert.match(key, /^r-001-[0-9a-f]{8}\.jpg$/);
  assert.equal(isOriginalKey(key), true);
  assert.equal(requests[0].url, `https://proj.supabase.co/storage/v1/object/desene-originale/${key}`);
  assert.equal(requests[0].headers["Content-Type"], "image/jpeg");
  assert.equal(requests[0].headers.Authorization, `Bearer ${KEY}`);

  const web = await files.savePublic({ bytes, kind: "web", code: "R-001" });
  assert.match(web, /^https:\/\/proj\.supabase\.co\/storage\/v1\/object\/public\/desene-public\/desen-r-001-[0-9a-f]{8}\.jpg$/);
  assert.equal(isPublicDrawingPath(web), true);
  const cup = await files.savePublic({ bytes, kind: "cup", code: "R-001", extension: "png" });
  assert.match(cup, /pahar-r-001-[0-9a-f]{8}\.png$/);
  assert.equal(requests[2].headers["Content-Type"], "image/png");

  const read = await files.readOriginal(key);
  assert.equal(read.mime, "image/jpeg");
  assert.equal(new TextDecoder().decode(read.bytes), "JPEGBYTES");
  assert.equal(requests[3].url, `https://proj.supabase.co/storage/v1/object/authenticated/desene-originale/${key}`);
  const count = requests.length;
  assert.equal(await files.readOriginal("../secret.jpg"), null);
  assert.equal(requests.length, count, "a crafted key never reaches Storage");

  await files.remove([
    key,
    web,
    null,
    "/photos/uploads/desen-r-001-0a1b2c3d.jpg",
    "https://evil.example/storage/v1/object/public/desene-public/desen-r-001-0a1b2c3d.jpg",
  ]);
  const deletes = requests.filter((r) => r.method === "DELETE");
  assert.deepEqual(
    deletes.map((r) => [r.url, JSON.parse(r.body).prefixes]),
    [
      ["https://proj.supabase.co/storage/v1/object/desene-originale", [key]],
      ["https://proj.supabase.co/storage/v1/object/desene-public", [web.split("/").pop()]],
    ],
  );
});
