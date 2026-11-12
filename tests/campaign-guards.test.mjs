import assert from "node:assert/strict";
import test from "node:test";

// The pure layer of the campaign server functions: phase enforcement per
// action, the vote eligibility (`not_votable`), the selection order, the
// public results (accepted + gallery only), the measurement (families, no
// personal fields) and the campaign host's canonical / robots routes.
// Fake data only; memory adapter.
import {
  cafeSubmissionRefusal,
  collectionRefusal,
  juryPickRefusal,
  nextCampaignStep,
  preregistrationRefusal,
  publishRefusal,
  publishResultsRefusal,
  reserveRefusal,
  resultsVisible,
  selectionRefusal,
  voteRefusal,
  voteTargetRefusal,
} from "../src/lib/campaign-guards.ts";
import { campaignPhase } from "../src/lib/campaign-phase.ts";
import { publicResults } from "../src/lib/campaign-results.ts";
import { campaignMeasurement, countFamilies } from "../src/lib/campaign-measurement.ts";
import { campaignCanonical, campaignRoute } from "../src/lib/campaign-host.ts";
import { parseDrawingForm } from "../src/lib/drawing-form.ts";
import { publicDrawing } from "../src/lib/drawing.ts";
import { createMemoryDb } from "../src/lib/db/memory.ts";
import { baseInput, liveEntry } from "./campaign-contract.mjs";

const db = createMemoryDb();

/* --------------------------------------------------------------- phases --- */

const at = (iso) => new Date(iso);
const NONE = { resultsPublishedAt: null, collectionConfirmedAt: null };
const PUBLISHED = { resultsPublishedAt: "2026-12-06T08:00:00.000Z", collectionConfirmedAt: null };
const COLLECTING = { ...PUBLISHED, collectionConfirmedAt: "2026-12-18T08:00:00.000Z" };

const BEFORE = campaignPhase(at("2026-11-15T21:59:59.999Z"), NONE);
const OPEN = campaignPhase(at("2026-11-15T22:00:00.000Z"), NONE);
const VOTING_ONLY = campaignPhase(at("2026-12-02T10:00:00.000Z"), NONE);
const CLOSED = campaignPhase(at("2026-12-03T22:00:00.000Z"), NONE);
const RESULTS = campaignPhase(at("2026-12-07T10:00:00.000Z"), PUBLISHED);
const COLLECTION = campaignPhase(at("2026-12-19T10:00:00.000Z"), COLLECTING);

test("phase fixtures are what they claim", () => {
  assert.deepEqual(
    [BEFORE, OPEN, VOTING_ONLY, CLOSED, RESULTS, COLLECTION],
    ["before_open", "submissions_open", "voting_only", "voting_closed", "results", "collection"],
  );
});

test("preregistration and café submission: not_open before 16.11, closed after 01.12", () => {
  for (const gate of [preregistrationRefusal, cafeSubmissionRefusal]) {
    assert.equal(gate(BEFORE), "not_open");
    assert.equal(gate(OPEN), null);
    for (const phase of [VOTING_ONLY, CLOSED, RESULTS, COLLECTION]) assert.equal(gate(phase), "closed");
  }
});

test("publishing and voting run until the vote closes, then closed", () => {
  for (const gate of [publishRefusal, voteRefusal]) {
    assert.equal(gate(BEFORE), "not_open");
    assert.equal(gate(OPEN), null);
    assert.equal(gate(VOTING_ONLY), null);
    for (const phase of [CLOSED, RESULTS, COLLECTION]) assert.equal(gate(phase), "closed");
  }
});

test("winners, reserves, acceptance: only after the vote closed, frozen once collection starts", () => {
  for (const phase of [BEFORE, OPEN, VOTING_ONLY]) assert.equal(selectionRefusal(phase), "not_open");
  assert.equal(selectionRefusal(CLOSED), null);
  assert.equal(selectionRefusal(RESULTS), null);
  assert.equal(selectionRefusal(COLLECTION), "closed");
});

test("results: not before 06.12 00:00 Bucharest, once only", () => {
  assert.equal(publishResultsRefusal(at("2026-12-05T21:59:59.999Z"), CLOSED), "not_open");
  assert.equal(publishResultsRefusal(at("2026-12-05T22:00:00.000Z"), CLOSED), null);
  assert.equal(publishResultsRefusal(at("2026-12-01T10:00:00.000Z"), OPEN), "not_open");
  assert.equal(publishResultsRefusal(at("2026-12-07T10:00:00.000Z"), RESULTS), "closed");
  assert.equal(resultsVisible(CLOSED), false);
  assert.equal(resultsVisible(RESULTS), true);
  assert.equal(resultsVisible(COLLECTION), true);
});

test("collection: only a manager's switch after the results, never by date", () => {
  assert.equal(collectionRefusal(CLOSED), "not_open");
  // Far past the estimated date, results still unpublished: still not open.
  assert.equal(collectionRefusal(campaignPhase(at("2027-01-10T10:00:00Z"), NONE)), "not_open");
  assert.equal(collectionRefusal(RESULTS), null);
  assert.equal(collectionRefusal(COLLECTION), "closed");
});

test("the admin bar always has a next step", () => {
  for (const phase of [BEFORE, OPEN, VOTING_ONLY, CLOSED, RESULTS, COLLECTION]) {
    assert.ok(nextCampaignStep(phase, at("2026-12-04T10:00:00Z")).label.length > 0);
  }
});

/* ------------------------------------------------------------------ vote --- */

test("vote target: calendar first, then online, then printable (not_votable)", async () => {
  await db.deleteDrawingEntries();
  const printable = await liveEntry(db, { consentGallery: true });
  const noReproduction = await liveEntry(db, { consentGallery: true, consentReproduction: false });
  const otherPaper = await liveEntry(db, { consentGallery: true, sheetKind: "alta-foaie" });

  assert.equal(voteTargetRefusal(printable, OPEN), null);
  assert.equal(voteTargetRefusal(printable, VOTING_ONLY), null);
  assert.equal(voteTargetRefusal(printable, BEFORE), "not_open");
  assert.equal(voteTargetRefusal(printable, CLOSED), "closed");
  assert.equal(voteTargetRefusal(noReproduction, OPEN), "not_votable");
  assert.equal(voteTargetRefusal(otherPaper, OPEN), "not_votable");
  // A closed vote says closed even for a gallery-only drawing.
  assert.equal(voteTargetRefusal(otherPaper, CLOSED), "closed");
  assert.equal(voteTargetRefusal(null, OPEN), "gone");

  const down = await db.unpublishDrawing(printable.id);
  assert.equal(voteTargetRefusal(down, OPEN), "gone");
});

test("public payload: votable = printable, no cup image when not printable", async () => {
  await db.deleteDrawingEntries();
  const ok = await liveEntry(db, { consentGallery: true });
  const withCup = { ...ok, cupMockup: "/photos/uploads/cup.jpg" };
  assert.equal(publicDrawing(withCup).votable, true);
  assert.equal(publicDrawing(withCup).cupImage, "/photos/uploads/cup.jpg");

  const other = { ...withCup, sheetKind: "alta-foaie" };
  assert.equal(publicDrawing(other).votable, false);
  assert.equal(publicDrawing(other).cupImage, null);

  const noConsent = { ...withCup, consentReproduction: false };
  assert.equal(publicDrawing(noConsent).votable, false);
  assert.equal(publicDrawing(noConsent).cupImage, null);
});

/* ------------------------------------------------------------- selection --- */

const sel = (overrides) => ({
  id: overrides.id,
  category: "6-9",
  status: "depus",
  consentReproduction: true,
  sheetKind: "oficiala",
  submittedAt: "2026-11-20T10:00:00.000Z",
  publishedAt: "2026-11-20T12:00:00.000Z",
  unpublishedAt: null,
  winnerKind: null,
  ...overrides,
});

test("jury: alta-foaie and no-consent drawings are never selectable, nor reserves", () => {
  const vote = sel({ id: "v", winnerKind: "vote" });
  const other = sel({ id: "a", sheetKind: "alta-foaie" });
  const noConsent = sel({ id: "c", consentReproduction: false });
  const all = [vote, other, noConsent];
  assert.equal(juryPickRefusal(other, all), "not_eligible");
  assert.equal(juryPickRefusal(noConsent, all), "not_eligible");
  assert.equal(reserveRefusal(other), "not_eligible");
  assert.equal(reserveRefusal(noConsent), "not_eligible");
});

test("jury: vote winner of the category first, unless nothing could win the vote", () => {
  const candidate = sel({ id: "x" });
  const rival = sel({ id: "y" });
  assert.equal(juryPickRefusal(candidate, [candidate, rival]), "vote_first");

  const withWinner = [candidate, rival, sel({ id: "v", winnerKind: "vote" })];
  assert.equal(juryPickRefusal(candidate, withWinner), null);
  assert.equal(juryPickRefusal(withWinner[2], withWinner), "is_vote_winner");

  // Nothing online in the category (art. 9^1.9): the jury does not wait.
  const offline = sel({ id: "o", publishedAt: null });
  assert.equal(juryPickRefusal(offline, [offline]), null);
  // Another category's winner does not count.
  const other = sel({ id: "k", category: "3-5", winnerKind: "vote" });
  assert.equal(juryPickRefusal(candidate, [candidate, rival, other]), "vote_first");
});

test("jury: handed in, not returned, ten cups at most", () => {
  const vote = sel({ id: "v", winnerKind: "vote" });
  const notIn = sel({ id: "n", status: "inregistrat", submittedAt: null });
  assert.equal(juryPickRefusal(notIn, [vote, notIn]), "not_submitted");
  const returned = sel({ id: "r", status: "returnat" });
  assert.equal(juryPickRefusal(returned, [vote, returned]), "returned");

  const winners = Array.from({ length: 9 }, (_, i) => sel({ id: `w${i}`, winnerKind: "jury" }));
  const tenth = sel({ id: "t" });
  assert.equal(juryPickRefusal(tenth, [vote, ...winners, tenth]), "full");
  assert.equal(juryPickRefusal(tenth, [vote, ...winners.slice(1), tenth]), null);
  assert.equal(reserveRefusal(sel({ id: "j", winnerKind: "jury" })), "is_winner");
});

test("store: alta-foaie cannot become a jury winner or a reserve", async () => {
  await db.deleteDrawingEntries();
  const entry = await liveEntry(db, { consentGallery: true, sheetKind: "alta-foaie" });
  assert.equal((await db.setDrawingWinner(entry.id, "jury")).status, "not_eligible");
  assert.equal((await db.setReserveRank(entry.id, 1)).status, "not_eligible");
});

/* --------------------------------------------------------------- results --- */

test("results: only accepted winners that are live in the gallery, nothing private", async () => {
  await db.deleteDrawingEntries();
  const voteOk = await liveEntry(db, { consentGallery: true, childAge: 7 });
  const juryOk = await liveEntry(db, { consentGallery: true, childAge: 8, attribution: "none" });
  const notAccepted = await liveEntry(db, { consentGallery: true, childAge: 6 });
  const takenDown = await liveEntry(db, { consentGallery: true, childAge: 9 });
  const noGallery = await db.createDrawingEntry({ ...baseInput, childAge: 4, consentGallery: false });
  await db.markDrawingSubmitted(noGallery.entry.id, { sheetKind: "colorat", staffId: null });

  await db.setDrawingWinner(voteOk.id, "vote");
  for (const e of [juryOk, notAccepted, takenDown, noGallery.entry]) {
    assert.equal((await db.setDrawingWinner(e.id, "jury")).status, "saved");
  }
  for (const e of [voteOk, juryOk, takenDown, noGallery.entry]) {
    await db.setWinnerAccepted(e.id, new Date("2026-12-05T10:00:00Z"));
  }
  await db.unpublishDrawing(takenDown.id);

  const results = publicResults(await db.listDrawingEntries());
  assert.equal(results["6-9"].vote.code, voteOk.code);
  assert.deepEqual(results["6-9"].jury.map((d) => d.code), [juryOk.code]);
  assert.equal(results["3-5"].vote, null);
  assert.deepEqual(results["3-5"].jury, []);
  assert.deepEqual(results["10-14"], { vote: null, jury: [] });

  const json = JSON.stringify(results);
  for (const leak of ["Părinte", baseInput.phone, voteOk.id, juryOk.id, "winner", "accepted", "era"]) {
    assert.ok(!json.includes(leak), `results leak ${leak}`);
  }
  assert.equal(results["6-9"].jury[0].firstName, null);
});

/* ----------------------------------------------------------- measurement --- */

test("families: two drawings of one parent are one family, only handed-in drawings count", () => {
  const entries = [
    { phone: "0740 038 569", location: "era", registeredVia: "web", submittedAt: "2026-11-20T10:00:00Z", status: "depus" },
    { phone: "0740038569", location: "era", registeredVia: "counter", submittedAt: "2026-11-20T10:05:00Z", status: "depus" },
    { phone: "0740000001", location: "rogerius", registeredVia: "web", submittedAt: null, status: "inregistrat" },
    { phone: "0740000002", location: "rogerius", registeredVia: "web", submittedAt: "2026-11-21T10:00:00Z", status: "expus" },
  ];
  assert.equal(countFamilies([entries[0], entries[1]]), 1);
  const m = campaignMeasurement([], entries);
  assert.equal(m.entries.families, 2);
  assert.equal(m.entries.preregistered, 3);
  assert.equal(m.entries.walkIns, 1);
  assert.equal(m.entries.submitted, 3);
  assert.equal(m.entries.preregisteredSubmitted, 2);
  assert.equal(m.entries.conversion, 2 / 3);
  assert.ok(!JSON.stringify(m).includes("0740"), "no phone in the measurement");
});

test("measurement: totals, per Bucharest day, per channel, per café", () => {
  const events = [
    { name: "prereg_complete", channel: "fb", location: "era", category: "6-9", createdAt: "2026-11-16T21:59:00.000Z" },
    { name: "prereg_complete", channel: "fb", location: "era", category: "3-5", createdAt: "2026-11-16T22:01:00.000Z" },
    { name: "share", method: "whatsapp", createdAt: "2026-11-17T10:00:00.000Z" },
  ];
  const m = campaignMeasurement(events, []);
  assert.equal(m.totals.prereg_complete, 2);
  assert.equal(m.totals.share, 1);
  assert.equal(m.totals.vote_confirmed, 0);
  // 22:01 UTC on the 16th is already the 17th in Bucharest.
  assert.deepEqual(m.perDay.map((d) => d.day), ["2026-11-16", "2026-11-17"]);
  assert.deepEqual(m.perChannel[0], { channel: "fb", counts: { prereg_complete: 2 } });
  assert.equal(m.perLocation.find((l) => l.location === "fara-cafenea").counts.share, 1);
  assert.equal(m.entries.conversion, null);
});

test("metrics never store personal fields, whatever the caller sends", async () => {
  await db.deleteDrawingEntries();
  const before = (await db.listCampaignEvents()).length;
  await db.recordCampaignEvent({
    name: "prereg_complete",
    location: "era",
    channel: "ana-0740038569",
    category: "6-9",
    phone: "0740038569",
    parentName: "Ana Pop",
    email: "ana@example.ro",
    drawingId: "abc",
  });
  await db.recordCampaignEvent({ name: "share", method: "ana@example.ro" });
  const stored = (await db.listCampaignEvents()).slice(before);
  assert.equal(stored.length, 2);
  for (const event of stored) {
    assert.deepEqual(
      Object.keys(event).filter((k) => !["name", "createdAt", "location", "channel", "category", "method"].includes(k)),
      [],
    );
  }
  const json = JSON.stringify(stored);
  for (const leak of ["0740038569", "Ana", "example.ro", "abc"]) assert.ok(!json.includes(leak), leak);
  assert.equal(stored[0].location, "era");
  assert.equal(stored[0].channel, undefined);
});

test("preregistration form: the hidden ch field becomes a slug channel or nothing", () => {
  const form = (ch) => {
    const f = new FormData();
    f.set("parentName", "Părinte Test");
    f.set("phone", "0700000099");
    f.set("childFirstName", "Test");
    f.set("childAge", "7");
    f.set("location", "era");
    f.set("consentParticipation", "on");
    if (ch !== undefined) f.set("ch", ch);
    return parseDrawingForm(f);
  };
  assert.equal(form("Instagram").values.channel, "instagram");
  assert.equal(form("ana-0740038569").values.channel, null);
  assert.equal(form("a@b.ro").values.channel, null);
  assert.equal(form(undefined).values.channel, null);
});

test("preregistration form: the child's name is its own opt-in, unticked = no name", () => {
  const form = (fields) => {
    const f = new FormData();
    f.set("parentName", "Părinte Test");
    f.set("phone", "0700000099");
    f.set("childFirstName", "Test");
    f.set("childAge", "7");
    f.set("location", "era");
    f.set("consentParticipation", "on");
    for (const name of fields) f.set(name, "on");
    return parseDrawingForm(f).values;
  };
  // The reproduction consent alone never carries the name.
  assert.equal(form(["consentReproduction"]).attribution, "none");
  assert.equal(form(["consentGallery"]).attribution, "none");
  assert.equal(form(["consentReproduction", "attributionName"]).attribution, "first-name-age");
  assert.equal(form(["consentGallery", "attributionName"]).attribution, "first-name-age");
  // Nowhere for the name to appear: the box means nothing.
  assert.equal(form(["attributionName"]).attribution, "none");
  // The old inverted box is gone: it no longer turns the name on or off.
  assert.equal(form(["consentReproduction", "attributionNone"]).attribution, "none");
});

/* ------------------------------------------------------- host + metadata --- */

test("canonical: short path on the campaign host, long path without it", () => {
  const env = { CAMPAIGN_HOST: "xmas.originscafe.ro" };
  assert.equal(campaignCanonical("/", env, null), "https://xmas.originscafe.ro/");
  assert.equal(campaignCanonical("/R-002", env, "https://app.x.ro"), "https://xmas.originscafe.ro/R-002");
  assert.equal(campaignCanonical("/regulament", env, null), "https://xmas.originscafe.ro/regulament");
  assert.equal(campaignCanonical("/", {}, "https://app.x.ro"), "https://app.x.ro/desene");
  assert.equal(campaignCanonical("/R-002", {}, "https://app.x.ro"), "https://app.x.ro/desene/R-002");
  assert.equal(campaignCanonical("/regulament", {}, "https://app.x.ro"), "https://app.x.ro/desene/regulament");
  assert.equal(campaignCanonical("/desen", {}, "https://app.x.ro"), "https://app.x.ro/desen");
  assert.equal(campaignCanonical("/", {}, null), null);
});

test("campaign host serves its own robots.txt and sitemap.xml; short links resolve", () => {
  assert.deepEqual(campaignRoute("/robots.txt"), { kind: "pass" });
  assert.deepEqual(campaignRoute("/sitemap.xml"), { kind: "pass" });
  assert.deepEqual(campaignRoute("/r-002"), { kind: "rewrite", to: "/desene/R-002" });
  assert.deepEqual(campaignRoute("/admin"), { kind: "rewrite", to: "/campanie-admin" });
});
