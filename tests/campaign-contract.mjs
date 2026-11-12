import assert from "node:assert/strict";
import { createHash } from "node:crypto";

/**
 * One behavioural contract for every campaign store: the memory adapter
 * (tests/campaign-store.test.mjs, always) and the Supabase adapter
 * (tests/campaign-store.integration.test.mjs, against Docker or a test
 * project). Same calls, same answers. Fake data only. Each step starts by
 * deleting the campaign data, so NEVER point it at a real project.
 */

export const hex = (seed) => createHash("sha256").update(String(seed)).digest("hex");

export const baseInput = {
  location: "era",
  childFirstName: "Test",
  childAge: 7,
  parentName: "Părinte Contract",
  phone: "0700000088",
  consentParticipation: true,
  consentReproduction: true,
  consentGallery: true,
  attribution: "first-name-age",
  consentPhoto: false,
  circleOptIn: false,
  registeredVia: "counter",
  registeredBy: "staff-era",
};

export const image = (code) => ({
  original: `${code.toLowerCase()}-9f8e7d6c.jpg`,
  web: `/photos/uploads/desen-${code.toLowerCase()}-0a1b2c3d.jpg`,
  width: 1600,
  height: 1131,
  cupMockup: null,
});

export async function liveEntry(db, overrides = {}, at = new Date()) {
  const created = await db.createDrawingEntry({ ...baseInput, ...overrides });
  assert.equal(created.status, "created");
  const submitted = await db.markDrawingSubmitted(
    created.entry.id,
    { sheetKind: overrides.sheetKind ?? "oficiala", staffId: "staff-era" },
    at,
  );
  assert.equal(submitted.status, "saved");
  await db.setDrawingImage(created.entry.id, image(created.entry.code), at);
  const published = await db.publishDrawing(created.entry.id, at);
  assert.equal(published.status, "published");
  return published.entry;
}

/** Registers the contract as node:test subtests on `t`. */
export async function runCampaignContract(t, db) {
  await t.test("entries: validation, sequential codes per location, lookups", async () => {
    await db.deleteDrawingEntries();
    assert.deepEqual(await db.listDrawingEntries(), []);

    assert.equal((await db.createDrawingEntry({ ...baseInput, consentParticipation: false })).status, "consent_required");
    assert.equal((await db.createDrawingEntry({ ...baseInput, location: "gara" })).status, "unknown_location");
    assert.equal((await db.createDrawingEntry({ ...baseInput, childFirstName: " A " })).status, "invalid_name");
    assert.equal((await db.createDrawingEntry({ ...baseInput, phone: "12" })).status, "invalid_phone");
    assert.equal((await db.createDrawingEntry({ ...baseInput, childAge: 15 })).status, "invalid_age");

    const a = await db.createDrawingEntry({ ...baseInput, now: new Date("2026-11-16T09:00:00Z") });
    const b = await db.createDrawingEntry({ ...baseInput, now: new Date("2026-11-16T09:01:00Z") });
    const r = await db.createDrawingEntry({
      ...baseInput,
      location: "rogerius",
      consentReproduction: false,
      consentGallery: false,
      phone: "+40 700 000 089",
      now: new Date("2026-11-16T09:02:00Z"),
    });
    assert.equal(a.entry.code, "E-001");
    assert.equal(b.entry.code, "E-002");
    assert.equal(r.entry.code, "R-001");
    assert.equal(r.entry.phone, "0700000089");
    // no consent for print or gallery: nothing to attribute
    assert.equal(r.entry.attribution, "none");
    assert.equal(a.entry.status, "inregistrat");
    assert.equal(a.entry.registeredBy, "staff-era");
    assert.equal(a.entry.createdAt, "2026-11-16T09:00:00.000Z");
    for (const key of ["sheetKind", "submittedAt", "submittedBy", "winnerKind", "winnerAcceptedAt", "reserveRank"]) {
      assert.equal(a.entry[key], null, key);
    }
    assert.equal(a.entry.voteWinner, false);

    assert.equal((await db.getDrawingEntry(a.entry.id)).code, "E-001");
    assert.equal(await db.getDrawingEntry("not-a-uuid"), null);
    assert.equal(await db.getDrawingEntry("00000000-0000-4000-8000-000000000000"), null);
    assert.equal((await db.findDrawingEntryByCode(" e 2 ")).id, b.entry.id);
    assert.equal(await db.findDrawingEntryByCode("X-1"), null);

    const all = await db.listDrawingEntries();
    assert.deepEqual(all.map((e) => e.code), ["R-001", "E-002", "E-001"]);
    const era = await db.listDrawingEntries({ location: "era" });
    assert.deepEqual(era.map((e) => e.code), ["E-002", "E-001"]);
  });

  await t.test("submission, status ladder, sheet kinds", async () => {
    await db.deleteDrawingEntries();
    const { entry } = await db.createDrawingEntry(baseInput);
    assert.equal((await db.markDrawingSubmitted(entry.id, { sheetKind: "carton", staffId: null })).status, "invalid_sheet_kind");
    const at = new Date("2026-11-17T10:00:00Z");
    const first = await db.markDrawingSubmitted(entry.id, { sheetKind: "colorat", staffId: "staff-a" }, at);
    assert.equal(first.status, "saved");
    assert.equal(first.from, "inregistrat");
    assert.equal(first.entry.status, "depus");
    assert.equal(first.entry.sheetKind, "colorat");
    assert.equal(first.entry.submittedAt, at.toISOString());
    assert.equal(first.entry.submittedBy, "staff-a");
    // a correction keeps the first submission time and person
    const fix = await db.markDrawingSubmitted(entry.id, { sheetKind: "alta-foaie", staffId: "staff-b" }, new Date("2026-11-18T10:00:00Z"));
    assert.equal(fix.entry.sheetKind, "alta-foaie");
    assert.equal(fix.entry.submittedAt, at.toISOString());
    assert.equal(fix.entry.submittedBy, "staff-a");
    assert.equal(fix.entry.status, "depus");

    assert.equal((await db.setDrawingStatus(entry.id, "selectat", "manager")).status, "invalid_transition");
    assert.equal((await db.setDrawingStatus(entry.id, "expus", "barista")).status, "saved");
    // other paper is never selectable for print
    assert.equal((await db.setDrawingStatus(entry.id, "selectat", "manager")).status, "not_eligible");
    await db.markDrawingSubmitted(entry.id, { sheetKind: "oficiala", staffId: null });
    assert.equal((await db.setDrawingStatus(entry.id, "selectat", "barista")).status, "invalid_transition");
    const picked = await db.setDrawingStatus(entry.id, "selectat", "manager");
    assert.equal(picked.status, "saved");
    assert.equal(picked.from, "expus");
    assert.equal((await db.markDrawingSubmitted(entry.id, { sheetKind: "oficiala", staffId: null })).status, "invalid_transition");
    assert.equal((await db.setDrawingStatus(entry.id, "returnat", "barista")).status, "saved");
    assert.equal((await db.setDrawingStatus(entry.id, "depus", "manager")).status, "invalid_transition");
    assert.equal((await db.markDrawingSubmitted("00000000-0000-4000-8000-000000000000", { sheetKind: "oficiala", staffId: null })).status, "not_found");

    // the old path still works: setDrawingStatus("depus") without a sheet kind
    const old = await db.createDrawingEntry(baseInput);
    const moved = await db.setDrawingStatus(old.entry.id, "depus", "barista");
    assert.equal(moved.status, "saved");
    assert.equal(moved.entry.sheetKind, null);
  });

  await t.test("gallery: image, publish rules, first publish time kept, take-down", async () => {
    await db.deleteDrawingEntries();
    const { entry } = await db.createDrawingEntry(baseInput);
    assert.deepEqual(await db.publishDrawing(entry.id), { status: "blocked", reason: "bad_status" });
    await db.markDrawingSubmitted(entry.id, { sheetKind: "oficiala", staffId: null });
    assert.deepEqual(await db.publishDrawing(entry.id), { status: "blocked", reason: "no_image" });
    const withImage = await db.setDrawingImage(entry.id, image(entry.code));
    assert.equal(withImage.imageWeb, image(entry.code).web);
    assert.equal(withImage.imageOriginal, image(entry.code).original);
    const t1 = new Date("2026-11-20T10:00:00Z");
    const pub = await db.publishDrawing(entry.id, t1);
    assert.equal(pub.status, "published");
    assert.equal(pub.entry.publishedAt, t1.toISOString());
    assert.deepEqual((await db.listPublishedDrawings()).map((e) => e.id), [entry.id]);
    const down = await db.unpublishDrawing(entry.id, new Date("2026-11-21T10:00:00Z"));
    assert.equal(down.unpublishedAt, "2026-11-21T10:00:00.000Z");
    assert.deepEqual(await db.listPublishedDrawings(), []);
    const again = await db.publishDrawing(entry.id, new Date("2026-11-22T10:00:00Z"));
    assert.equal(again.entry.publishedAt, t1.toISOString());
    assert.equal(again.entry.unpublishedAt, null);

    const noConsent = await db.createDrawingEntry({ ...baseInput, consentGallery: false });
    await db.markDrawingSubmitted(noConsent.entry.id, { sheetKind: "oficiala", staffId: null });
    await db.setDrawingImage(noConsent.entry.id, image(noConsent.entry.code));
    assert.deepEqual(await db.publishDrawing(noConsent.entry.id), { status: "blocked", reason: "no_consent" });
    assert.equal(await db.setDrawingImage("00000000-0000-4000-8000-000000000000", image("E-009")), null);
  });

  await t.test("vote: codes, attempts, one vote per drawing per e-mail", async () => {
    await db.deleteDrawingEntries();
    const live = await liveEntry(db);
    const voter = hex("voter-1");
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    assert.deepEqual(
      await db.redeemVoteCode({ drawingId: live.id, emailHash: voter, codeHash: hex("x"), maxAttempts: 3 }),
      { status: "no_code" },
    );
    await db.createVoteCode({ drawingId: live.id, emailHash: voter, codeHash: hex("code-1"), expiresAt });
    assert.deepEqual(
      await db.redeemVoteCode({ drawingId: live.id, emailHash: voter, codeHash: hex("bad"), maxAttempts: 3 }),
      { status: "wrong_code", attemptsLeft: 2 },
    );
    assert.deepEqual(
      await db.redeemVoteCode({ drawingId: live.id, emailHash: voter, codeHash: hex("code-1"), maxAttempts: 3 }),
      { status: "voted" },
    );
    assert.equal(await db.hasVoted(live.id, voter), true);
    // the code is spent
    assert.deepEqual(
      await db.redeemVoteCode({ drawingId: live.id, emailHash: voter, codeHash: hex("code-1"), maxAttempts: 3 }),
      { status: "no_code" },
    );
    assert.deepEqual(await db.castVote({ drawingId: live.id, emailHash: voter }), { status: "already_voted" });
    await db.createVoteCode({ drawingId: live.id, emailHash: voter, codeHash: hex("code-2"), expiresAt });
    assert.deepEqual(
      await db.redeemVoteCode({ drawingId: live.id, emailHash: voter, codeHash: hex("code-2"), maxAttempts: 3 }),
      { status: "already_voted" },
    );

    // too many attempts
    const other = hex("voter-2");
    await db.createVoteCode({ drawingId: live.id, emailHash: other, codeHash: hex("c"), expiresAt });
    for (const left of [2, 1]) {
      assert.deepEqual(
        await db.redeemVoteCode({ drawingId: live.id, emailHash: other, codeHash: hex("no"), maxAttempts: 3 }),
        { status: "wrong_code", attemptsLeft: left },
      );
    }
    assert.deepEqual(
      await db.redeemVoteCode({ drawingId: live.id, emailHash: other, codeHash: hex("no"), maxAttempts: 3 }),
      { status: "too_many_attempts" },
    );
    assert.deepEqual(
      await db.redeemVoteCode({ drawingId: live.id, emailHash: other, codeHash: hex("c"), maxAttempts: 3 }),
      { status: "too_many_attempts" },
    );
    // a resend replaces the code and resets the attempts
    await db.createVoteCode({ drawingId: live.id, emailHash: other, codeHash: hex("c2"), expiresAt });
    assert.deepEqual(
      await db.redeemVoteCode({ drawingId: live.id, emailHash: other, codeHash: hex("c2"), maxAttempts: 3 }),
      { status: "voted" },
    );

    // expired
    const late = hex("voter-3");
    await db.createVoteCode({
      drawingId: live.id,
      emailHash: late,
      codeHash: hex("c3"),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    assert.deepEqual(
      await db.redeemVoteCode({ drawingId: live.id, emailHash: late, codeHash: hex("c3"), maxAttempts: 3 }),
      { status: "expired" },
    );

    // one-tap vote from a verified voter, and not on a drawing that is offline
    const tap = hex("voter-4");
    assert.deepEqual(await db.castVote({ drawingId: live.id, emailHash: tap }), { status: "voted" });
    assert.deepEqual(await db.castVote({ drawingId: live.id, emailHash: tap }), { status: "already_voted" });
    const offline = await db.createDrawingEntry(baseInput);
    assert.deepEqual(await db.castVote({ drawingId: offline.entry.id, emailHash: tap }), { status: "not_live" });
    assert.deepEqual(await db.castVote({ drawingId: "nope", emailHash: tap }), { status: "not_live" });
    assert.equal(await db.hasVoted(offline.entry.id, tap), false);

    const votes = await db.listDrawingVotes();
    assert.equal(votes.length, 3);
    assert.ok(votes.every((v) => v.drawingId === live.id && /^[0-9a-f]{64}$/.test(v.emailHash)));
    assert.ok(votes[0].createdAt <= votes[1].createdAt && votes[1].createdAt <= votes[2].createdAt);
  });

  await t.test("winners: vote (one per category), jury, acceptance, reserves", async () => {
    await db.deleteDrawingEntries();
    const a = await liveEntry(db);
    const b = await liveEntry(db);
    const noPrint = await liveEntry(db, { consentReproduction: false });
    const otherPaper = await liveEntry(db, { sheetKind: "alta-foaie" });
    const small = await liveEntry(db, { childAge: 4 });

    assert.equal((await db.setDrawingWinner(noPrint.id, "vote")).status, "not_eligible");
    assert.equal((await db.setDrawingWinner(otherPaper.id, "jury")).status, "not_eligible");
    const first = await db.setDrawingVoteWinner(a.id, true);
    assert.equal(first.status, "saved");
    assert.equal(first.entry.voteWinner, true);
    assert.equal(first.entry.winnerKind, "vote");
    assert.equal(first.replaced, null);
    const second = await db.setDrawingWinner(b.id, "vote");
    assert.equal(second.status, "saved");
    assert.equal(second.replaced.id, a.id);
    assert.equal(second.replaced.voteWinner, false);
    assert.equal((await db.getDrawingEntry(a.id)).winnerKind, null);
    // another category keeps its own winner
    assert.equal((await db.setDrawingWinner(small.id, "vote")).replaced, null);
    assert.equal((await db.getDrawingEntry(b.id)).voteWinner, true);

    assert.equal((await db.setDrawingWinner(b.id, "jury")).status, "is_vote_winner");
    const jury = await db.setDrawingWinner(a.id, "jury");
    assert.equal(jury.status, "saved");
    assert.equal(jury.entry.winnerKind, "jury");
    assert.equal(jury.entry.voteWinner, false);
    // unmarking a VOTE win leaves a jury pick alone
    assert.equal((await db.setDrawingVoteWinner(a.id, false)).entry.winnerKind, "jury");

    assert.equal((await db.setWinnerAccepted(noPrint.id, new Date())).status, "not_winner");
    const acceptedAt = new Date("2026-12-05T12:00:00Z");
    const accepted = await db.setWinnerAccepted(a.id, acceptedAt);
    assert.equal(accepted.entry.winnerAcceptedAt, acceptedAt.toISOString());
    assert.equal((await db.setWinnerAccepted(a.id, null)).entry.winnerAcceptedAt, null);
    await db.setWinnerAccepted(a.id, acceptedAt);
    const cleared = await db.setDrawingWinner(a.id, null);
    assert.equal(cleared.entry.winnerKind, null);
    assert.equal(cleared.entry.winnerAcceptedAt, null);

    // the vote winner of a category cannot be put to "selectat"
    await db.setDrawingStatus(b.id, "expus", "barista");
    assert.equal((await db.setDrawingStatus(b.id, "selectat", "manager")).status, "invalid_transition");
    // a jury pick ("selectat") cannot win the public vote
    await db.setDrawingStatus(a.id, "expus", "barista");
    assert.equal((await db.setDrawingStatus(a.id, "selectat", "manager")).status, "saved");
    assert.equal((await db.setDrawingWinner(a.id, "vote")).status, "is_jury_pick");
    const offline = await db.createDrawingEntry(baseInput);
    assert.equal((await db.setDrawingWinner(offline.entry.id, "vote")).status, "not_live");
    assert.equal((await db.setDrawingWinner("00000000-0000-4000-8000-000000000000", "vote")).status, "not_found");

    // reserves
    assert.equal((await db.setReserveRank(a.id, 0)).status, "invalid_rank");
    assert.equal((await db.setReserveRank(a.id, 1.5)).status, "invalid_rank");
    assert.equal((await db.setReserveRank(b.id, 1)).status, "is_winner");
    assert.equal((await db.setReserveRank(noPrint.id, 1)).status, "not_eligible");
    assert.equal((await db.setReserveRank(otherPaper.id, 1)).status, "not_eligible");
    const r1 = await db.setReserveRank(a.id, 1);
    assert.equal(r1.status, "saved");
    assert.equal(r1.entry.reserveRank, 1);
    const c = await liveEntry(db);
    assert.equal((await db.setReserveRank(c.id, 1)).status, "rank_taken");
    assert.equal((await db.setReserveRank(c.id, 2)).entry.reserveRank, 2);
    // a reserve cannot be moved to other paper, and becoming a winner clears the rank
    assert.equal((await db.markDrawingSubmitted(c.id, { sheetKind: "alta-foaie", staffId: null })).status, "not_eligible");
    const promoted = await db.setDrawingWinner(c.id, "jury");
    assert.equal(promoted.entry.reserveRank, null);
    assert.equal((await db.setReserveRank(a.id, null)).entry.reserveRank, null);
  });

  await t.test("campaign state, events, shared rate limit", async () => {
    await db.updateCampaignState({ resultsPublishedAt: null, collectionConfirmedAt: null });
    assert.deepEqual(await db.getCampaignState(), { resultsPublishedAt: null, collectionConfirmedAt: null });
    const published = "2026-12-06T08:00:00.000Z";
    assert.deepEqual(await db.updateCampaignState({ resultsPublishedAt: published }), {
      resultsPublishedAt: published,
      collectionConfirmedAt: null,
    });
    assert.deepEqual(await db.updateCampaignState({ collectionConfirmedAt: "2026-12-18T09:00:00.000Z" }), {
      resultsPublishedAt: published,
      collectionConfirmedAt: "2026-12-18T09:00:00.000Z",
    });
    await db.updateCampaignState({ resultsPublishedAt: null, collectionConfirmedAt: null });

    // a time window nobody else writes into, so reruns do not collide
    const base = Date.UTC(2031, 0, 1) + Math.floor(Math.random() * 1e9);
    const at = (m) => new Date(base + m * 60_000);
    await db.recordCampaignEvent({ name: "share", method: "whatsapp", channel: "fb", now: at(1) });
    await db.recordCampaignEvent({ name: "vote_confirmed", category: "6-9", now: at(2) });
    // identifying junk is dropped, never stored
    await db.recordCampaignEvent({ name: "prereg_start", channel: "ana-0740038569", location: "Ana Pop", now: at(3) });
    await db.recordCampaignEvent({ name: "map_click", location: "era", now: at(10) });
    await assert.rejects(() => db.recordCampaignEvent({ name: "parent_phone", now: at(4) }));
    const events = await db.listCampaignEvents({ from: at(0), to: at(5) });
    assert.deepEqual(events, [
      { name: "share", channel: "fb", method: "whatsapp", createdAt: at(1).toISOString() },
      { name: "vote_confirmed", category: "6-9", createdAt: at(2).toISOString() },
      { name: "prereg_start", createdAt: at(3).toISOString() },
    ]);
    assert.deepEqual(
      (await db.listCampaignEvents({ from: at(0), to: at(11), name: "map_click" })).map((e) => e.location),
      ["era"],
    );

    const key = `test:${Math.random()}`;
    const window = { limit: 2, windowMs: 60_000 };
    const t0 = new Date(base);
    assert.equal(await db.rateLimitHit(key, window, t0), true);
    assert.equal(await db.rateLimitHit(key, window, new Date(base + 1000)), true);
    assert.equal(await db.rateLimitHit(key, window, new Date(base + 2000)), false);
    assert.equal(await db.rateLimitHit(key, window, new Date(base + 61_000)), true);
  });

  await t.test("end of campaign: everything goes, codes restart", async () => {
    await db.deleteDrawingEntries();
    const live = await liveEntry(db);
    await db.castVote({ drawingId: live.id, emailHash: hex("bye") });
    await db.createVoteCode({
      drawingId: live.id,
      emailHash: hex("bye-2"),
      codeHash: hex("c"),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    assert.deepEqual(await db.deleteDrawingEntries(), { deleted: 1 });
    assert.deepEqual(await db.listDrawingEntries(), []);
    assert.deepEqual(await db.listDrawingVotes(), []);
    assert.equal((await db.createDrawingEntry(baseInput)).entry.code, "E-001");
    await db.deleteDrawingEntries();
  });
}
