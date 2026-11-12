import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

// The Supabase campaign store against a REAL Postgres + PostgREST.
// Skipped unless TEST_SUPABASE_URL and TEST_SUPABASE_SERVICE_ROLE_KEY are
// set. Run against the local Docker stack, never a real project: every
// step deletes the campaign data.
//
//   eval "$(tools/campaign-db-local.sh up | grep -v '^#')"
//   TEST_SUPABASE_DOCKER=1 npm test
//
// TEST_SUPABASE_ANON_KEY enables the "anon reads nothing" checks;
// TEST_SUPABASE_DOCKER=1 also restarts the containers mid-test to prove
// the data survives a database restart.
import { createSupabaseCampaignStore } from "../src/lib/db/supabase-campaign.ts";
import { baseInput, hex, liveEntry, runCampaignContract } from "./campaign-contract.mjs";

const URL_ = process.env.TEST_SUPABASE_URL;
const KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.TEST_SUPABASE_ANON_KEY;
const DOCKER = process.env.TEST_SUPABASE_DOCKER === "1";
const skip = !URL_ || !KEY ? "TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_ROLE_KEY not set" : false;

const store = () => createSupabaseCampaignStore({ url: URL_, serviceRoleKey: KEY });

test("supabase adapter satisfies the campaign contract", { skip }, async (t) => {
  await runCampaignContract(t, store());
});

test("concurrent registrations get unique, gapless codes", { skip }, async () => {
  const db = store();
  await db.deleteDrawingEntries();
  const results = await Promise.all(
    Array.from({ length: 25 }, (_, i) =>
      createSupabaseCampaignStore({ url: URL_, serviceRoleKey: KEY }).createDrawingEntry({
        ...baseInput,
        location: i % 2 ? "era" : "rogerius",
        childFirstName: `Copil ${i}`,
      }),
    ),
  );
  assert.ok(results.every((r) => r.status === "created"));
  const codes = results.map((r) => r.entry.code);
  assert.equal(new Set(codes).size, 25);
  const era = codes.filter((c) => c.startsWith("E-")).sort();
  const rog = codes.filter((c) => c.startsWith("R-")).sort();
  assert.deepEqual(era, Array.from({ length: 12 }, (_, i) => `E-${String(i + 1).padStart(3, "0")}`));
  assert.deepEqual(rog, Array.from({ length: 13 }, (_, i) => `R-${String(i + 1).padStart(3, "0")}`));
});

test("one code redeemed 10 times in parallel counts exactly one vote", { skip }, async () => {
  const db = store();
  await db.deleteDrawingEntries();
  const live = await liveEntry(db);
  const voter = hex("parallel-voter");
  await db.createVoteCode({
    drawingId: live.id,
    emailHash: voter,
    codeHash: hex("123456"),
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      store().redeemVoteCode({ drawingId: live.id, emailHash: voter, codeHash: hex("123456"), maxAttempts: 5 }),
    ),
  );
  const statuses = results.map((r) => r.status).sort();
  assert.equal(statuses.filter((s) => s === "voted").length, 1, statuses.join(","));
  assert.ok(statuses.every((s) => s === "voted" || s === "no_code"), statuses.join(","));
  assert.equal((await db.listDrawingVotes()).length, 1);
});

test("parallel one-tap votes from one e-mail: one row; wrong codes in parallel: attempts capped", { skip }, async () => {
  const db = store();
  await db.deleteDrawingEntries();
  const live = await liveEntry(db);
  const voter = hex("tap-voter");
  const taps = await Promise.all(
    Array.from({ length: 10 }, () => store().castVote({ drawingId: live.id, emailHash: voter })),
  );
  assert.equal(taps.filter((r) => r.status === "voted").length, 1);
  assert.equal(taps.filter((r) => r.status === "already_voted").length, 9);

  const guesser = hex("guesser");
  await db.createVoteCode({
    drawingId: live.id,
    emailHash: guesser,
    codeHash: hex("right"),
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      store().redeemVoteCode({ drawingId: live.id, emailHash: guesser, codeHash: hex(`wrong-${i}`), maxAttempts: 5 }),
    ),
  );
  // after 5 wrong attempts even the right code is refused
  assert.deepEqual(
    await db.redeemVoteCode({ drawingId: live.id, emailHash: guesser, codeHash: hex("right"), maxAttempts: 5 }),
    { status: "too_many_attempts" },
  );
  assert.equal((await db.listDrawingVotes()).length, 1);
});

test("the database refuses a second vote even past the adapter (unique index)", { skip }, async () => {
  const db = store();
  await db.deleteDrawingEntries();
  const live = await liveEntry(db);
  const headers = {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
  };
  const row = JSON.stringify({ entry_id: live.id, email_hash: hex("raw") });
  const first = await fetch(`${URL_}/rest/v1/drawing_votes`, { method: "POST", headers, body: row });
  assert.equal(first.status, 201);
  const second = await fetch(`${URL_}/rest/v1/drawing_votes`, { method: "POST", headers, body: row });
  assert.equal(second.status, 409);
  assert.equal((await second.json()).code, "23505");
});

test("data survives a fresh adapter, a fresh process and a database restart", { skip }, async () => {
  const db = store();
  await db.deleteDrawingEntries();
  const live = await liveEntry(db);
  await db.castVote({ drawingId: live.id, emailHash: hex("persist") });
  await db.updateCampaignState({ resultsPublishedAt: "2026-12-06T08:00:00.000Z" });

  // a different process, nothing shared but the database
  const child = execFileSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--input-type=module",
      "-e",
      `import { createSupabaseCampaignStore } from ${JSON.stringify(path.resolve("src/lib/db/supabase.ts"))};
       const db = createSupabaseCampaignStore({ url: process.env.TEST_SUPABASE_URL, serviceRoleKey: process.env.TEST_SUPABASE_SERVICE_ROLE_KEY });
       const e = await db.findDrawingEntryByCode(${JSON.stringify(live.code)});
       const v = await db.listDrawingVotes();
       console.log(JSON.stringify({ id: e?.id, phone: e?.phone, votes: v.length }));`,
    ],
    { encoding: "utf8", env: process.env },
  );
  assert.deepEqual(JSON.parse(child.trim()), { id: live.id, phone: baseInput.phone, votes: 1 });

  if (DOCKER) {
    execFileSync("bash", [path.resolve("tools/campaign-db-local.sh"), "restart"], { stdio: "ignore" });
    const after = store();
    const entry = await after.getDrawingEntry(live.id);
    assert.equal(entry.code, live.code);
    assert.equal(entry.publishedAt, live.publishedAt);
    assert.equal(await after.hasVoted(live.id, hex("persist")), true);
    assert.equal((await after.getCampaignState()).resultsPublishedAt, "2026-12-06T08:00:00.000Z");
  }
  await db.updateCampaignState({ resultsPublishedAt: null });
});

test("anon cannot read parent data, votes, codes or events, nor call the RPCs", { skip: skip || (!ANON && "TEST_SUPABASE_ANON_KEY not set") }, async () => {
  const db = store();
  await db.deleteDrawingEntries();
  const live = await liveEntry(db);
  await db.castVote({ drawingId: live.id, emailHash: hex("anon-test") });
  await db.recordCampaignEvent({ name: "share", method: "copy" });
  const anon = { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" };

  for (const table of [
    "drawing_entries?select=parent_name,phone",
    "drawing_entries?select=id",
    "drawing_votes?select=*",
    "drawing_vote_codes?select=*",
    "campaign_events?select=*",
    "campaign_state?select=*",
    "campaign_rate_limits?select=*",
    "drawing_code_sequences?select=*",
  ]) {
    const response = await fetch(`${URL_}/rest/v1/${table}`, { headers: anon });
    const body = await response.json();
    // Either a hard refusal (0004 revokes the grants) or, at worst, nothing.
    assert.ok(
      response.status === 401 || response.status === 403 || (Array.isArray(body) && body.length === 0),
      `${table}: ${response.status} ${JSON.stringify(body)}`,
    );
    assert.ok(!JSON.stringify(body).includes(baseInput.phone), table);
  }
  for (const [fn, args] of [
    ["next_drawing_code", { p_location: "era" }],
    ["cast_drawing_vote", { p_entry_id: live.id, p_email_hash: hex("anon-vote") }],
    ["delete_drawing_campaign_data", {}],
    ["redeem_drawing_vote_code", { p_entry_id: live.id, p_email_hash: hex("x"), p_code_hash: "x", p_max_attempts: 5 }],
  ]) {
    const response = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers: anon, body: JSON.stringify(args) });
    assert.ok([401, 403].includes(response.status), `${fn}: ${response.status}`);
  }
  // writes are refused too
  const insert = await fetch(`${URL_}/rest/v1/drawing_votes`, {
    method: "POST",
    headers: anon,
    body: JSON.stringify({ entry_id: live.id, email_hash: hex("anon-insert") }),
  });
  assert.ok([401, 403].includes(insert.status));
  assert.equal((await db.listDrawingVotes()).length, 1);
  await db.deleteDrawingEntries();
});

test("Storage: original private (service role only), web file public, delete works", { skip: skip || (!DOCKER && "TEST_SUPABASE_DOCKER not set (needs the local storage-api)") }, async () => {
  const { createSupabaseDrawingFileStore } = await import("../src/lib/storage/supabase-drawings.ts");
  const files = createSupabaseDrawingFileStore({ url: URL_, serviceRoleKey: KEY });
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const key = await files.saveOriginal({ bytes, type: "jpeg", code: "E-042" });
  const web = await files.savePublic({ bytes, kind: "web", code: "E-042" });

  const back = await files.readOriginal(key);
  assert.deepEqual([...back.bytes], [...bytes]);
  // no public URL for the original, with or without the anon key
  const leaked = await fetch(`${URL_}/storage/v1/object/public/desene-originale/${key}`);
  assert.ok(leaked.status >= 400, `public original: ${leaked.status}`);
  if (ANON) {
    const anonRead = await fetch(`${URL_}/storage/v1/object/authenticated/desene-originale/${key}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    assert.ok(anonRead.status >= 400, `anon original: ${anonRead.status}`);
  }
  // the gallery file is public, no key at all
  const pub = await fetch(web);
  assert.equal(pub.status, 200);
  assert.deepEqual([...new Uint8Array(await pub.arrayBuffer())], [...bytes]);

  await files.remove([key, web]);
  assert.equal(await files.readOriginal(key), null);
  assert.ok((await fetch(web)).status >= 400);
});
