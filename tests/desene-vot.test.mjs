import assert from "node:assert/strict";
import test from "node:test";

// Galeria online și votul public al concursului de desene: the pure rules
// (lib/drawing-vote.ts, lib/vote-hash.ts, lib/drawing-image.ts), the memory
// adapter flows and the public payload. Fake data only.
import {
  CONTEST_CALENDAR,
  drawingIsLive,
  drawingPublishBlock,
  JURY_PICKS_PER_CATEGORY,
  publicDrawing,
  VOTE_CLOSES_AT,
} from "../src/lib/drawing.ts";
import {
  BURST_THRESHOLD,
  bucharestInstant,
  burstIsSuspicious,
  daysOnline,
  isDisposableEmail,
  normalizeVoteCode,
  normalizeVoterEmail,
  parseGallerySeed,
  rankByCategory,
  rankStandings,
  stableShuffle,
  voteBursts,
  votesPerDay,
  votingOpen,
} from "../src/lib/drawing-vote.ts";
import {
  generateVoteCode,
  hashVoteCode,
  hashVoterEmail,
  sealVoterToken,
  unsealVoterToken,
} from "../src/lib/vote-hash.ts";
import {
  checkWebImage,
  fitWithin,
  isOriginalKey,
  isPublicDrawingPath,
  jpegSize,
  sniffImage,
} from "../src/lib/drawing-image.ts";
import { drawingExportCsv, voteExportCsv } from "../src/lib/export.ts";
import { createMemoryDb } from "../src/lib/db/memory.ts";

const db = createMemoryDb();
const SECRET = "test-secret-test-secret-test-secret-0001";
const DAY = 24 * 60 * 60_000;

const baseInput = {
  location: "era",
  childFirstName: "Test",
  childAge: 7,
  parentName: "Părinte Vot",
  phone: "0700000077",
  consentParticipation: true,
  consentReproduction: true,
  consentGallery: true,
  attribution: "first-name-age",
  consentPhoto: false,
  circleOptIn: false,
  registeredVia: "counter",
};

const IMAGE = {
  original: "e-001-9f8e7d6c.jpg",
  web: "/photos/uploads/desen-e-001-0a1b2c3d.jpg",
  width: 1600,
  height: 1131,
  cupMockup: null,
};

/** A drawing that is online: registered, handed in, photographed, published. */
async function liveEntry(overrides = {}, publishedAt = new Date("2026-11-20T10:00:00Z")) {
  const created = await db.createDrawingEntry({ ...baseInput, ...overrides });
  assert.equal(created.status, "created");
  await db.setDrawingStatus(created.entry.id, "depus", "barista");
  await db.setDrawingImage(created.entry.id, IMAGE);
  const published = await db.publishDrawing(created.entry.id, publishedAt);
  assert.equal(published.status, "published");
  return published.entry;
}

/* ---------------------------------------------------------------- e-mail --- */

test("voter e-mail: lowercase, trim, +tag stripped, gmail dots stripped", () => {
  assert.equal(normalizeVoterEmail("  Ana.Pop@Example.RO "), "ana.pop@example.ro");
  assert.equal(normalizeVoterEmail("ana+vot@example.ro"), "ana@example.ro");
  assert.equal(normalizeVoterEmail("ana+a+b@example.ro"), "ana@example.ro");
  // Gmail ignores dots; other providers do not.
  assert.equal(normalizeVoterEmail("A.n.a.Pop+x@Gmail.com"), "anapop@gmail.com");
  assert.equal(normalizeVoterEmail("ana.pop@googlemail.com"), "anapop@gmail.com");
  assert.equal(normalizeVoterEmail("ana.pop@yahoo.com"), "ana.pop@yahoo.com");
});

test("voter e-mail: shapes that are not an address are refused", () => {
  for (const bad of [
    "",
    "ana",
    "ana@",
    "@example.ro",
    "ana@example",
    "ana pop@example.ro",
    "ana@exa mple.ro",
    "+tag@example.ro",
    "...@gmail.com",
    "ana@example..ro",
    "ana@-example.ro",
    `${"a".repeat(65)}@example.ro`,
    "ana@example.ro\nbcc: x@y.ro",
  ]) {
    assert.equal(normalizeVoterEmail(bad), null, JSON.stringify(bad));
  }
});

test("disposable domains are blocked, subdomains included, normal ones pass", () => {
  assert.equal(isDisposableEmail("x@mailinator.com"), true);
  assert.equal(isDisposableEmail("x@sub.yopmail.com"), true);
  assert.equal(isDisposableEmail("x@gmail.com"), false);
  assert.equal(isDisposableEmail("x@yahoo.ro"), false);
  // A lookalike that only ENDS in the same letters is not a subdomain.
  assert.equal(isDisposableEmail("x@notmailinator.com"), false);
});

/* --------------------------------------------------------------- hashing --- */

test("e-mail hash: same mailbox same hash, keyed, never the address", () => {
  const a = hashVoterEmail(normalizeVoterEmail("Ana.Pop+1@gmail.com"), SECRET);
  const b = hashVoterEmail(normalizeVoterEmail("anapop@googlemail.com"), SECRET);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.ok(!a.includes("ana"));
  assert.notEqual(a, hashVoterEmail("anapop@gmail.com", `${SECRET}-other`));
  assert.notEqual(a, hashVoterEmail("anapop2@gmail.com", SECRET));
});

test("vote code: six digits, bound to the drawing and the voter", () => {
  for (let i = 0; i < 50; i += 1) assert.match(generateVoteCode(), /^\d{6}$/);
  assert.equal(normalizeVoteCode(" 123 456 "), "123456");
  assert.equal(normalizeVoteCode("123-456"), "123456");
  assert.equal(normalizeVoteCode("12345"), null);
  assert.equal(normalizeVoteCode("1234567"), null);
  assert.equal(normalizeVoteCode("12a456"), null);

  const hash = hashVoteCode("123456", "drawing-1", "voter-1", SECRET);
  assert.notEqual(hash, hashVoteCode("123456", "drawing-2", "voter-1", SECRET));
  assert.notEqual(hash, hashVoteCode("123456", "drawing-1", "voter-2", SECRET));
  assert.notEqual(hash, hashVoteCode("123457", "drawing-1", "voter-1", SECRET));
});

test("verified-voter token: round trip, forged and expired refused", () => {
  const emailHash = hashVoterEmail("ana@example.ro", SECRET);
  const now = new Date("2026-11-20T10:00:00Z");
  const token = sealVoterToken(emailHash, SECRET, now);
  assert.equal(unsealVoterToken(token, SECRET, now), emailHash);
  assert.ok(!token.includes("ana@"));

  assert.equal(unsealVoterToken(token, `${SECRET}-other`, now), null);
  assert.equal(unsealVoterToken(token.replace(/^./, "0"), SECRET, now), null);
  assert.equal(unsealVoterToken(`${token}x`, SECRET, now), null);
  assert.equal(unsealVoterToken("", SECRET, now), null);
  assert.equal(unsealVoterToken(undefined, SECRET, now), null);
  // Eight days later the seven-day token is dead.
  assert.equal(unsealVoterToken(token, SECRET, new Date(now.getTime() + 8 * DAY)), null);
});

/* ----------------------------------------------------------------- clock --- */

test("calendar constants are the client's dates", () => {
  assert.deepEqual(CONTEST_CALENDAR, {
    drawingsFrom: "2026-11-16",
    drawingsUntil: "2026-12-01",
    juryFrom: "2026-12-02",
    juryUntil: "2026-12-03",
    filesToSupplier: "2026-12-07",
    announcement: "2026-12-06",
  });
  assert.deepEqual(JURY_PICKS_PER_CATEGORY, { "3-5": 2, "6-9": 3, "10-14": 2 });
});

test("vote closes at the end of 03.12.2026 23:59, Bucharest time", () => {
  // The stored instant is midnight Bucharest, i.e. the end of the 23:59 minute.
  assert.equal(
    new Date(VOTE_CLOSES_AT).getTime(),
    bucharestInstant(2026, 12, 4, 0, 0).getTime(),
  );
  // December is EET (UTC+2): 23:59 in Oradea is 21:59 UTC.
  assert.equal(bucharestInstant(2026, 12, 3, 23, 59).toISOString(), "2026-12-03T21:59:00.000Z");
  // And the helper follows summer time too (EEST, UTC+3).
  assert.equal(bucharestInstant(2026, 7, 1, 12, 0).toISOString(), "2026-07-01T09:00:00.000Z");

  assert.equal(votingOpen(bucharestInstant(2026, 11, 16, 9, 0)), true);
  assert.equal(votingOpen(bucharestInstant(2026, 12, 3, 23, 59)), true);
  assert.equal(votingOpen(new Date("2026-12-03T21:59:59.999Z")), true);
  assert.equal(votingOpen(new Date("2026-12-03T22:00:00.000Z")), false);
  assert.equal(votingOpen(bucharestInstant(2026, 12, 4, 0, 1)), false);
  // 23:30 UTC on 3 December is already 4 December in Oradea: closed.
  assert.equal(votingOpen(new Date("2026-12-03T23:30:00Z")), false);
});

/* --------------------------------------------------------------- ranking --- */

const close = new Date(VOTE_CLOSES_AT);
const beforeClose = (days) => new Date(close.getTime() - days * DAY).toISOString();
const afterClose = new Date(close.getTime() + 5 * DAY);

test("days online: fractional, measured to the close, never under one day", () => {
  assert.equal(daysOnline(beforeClose(10), afterClose), 10);
  assert.equal(daysOnline(beforeClose(2.5), afterClose), 2.5);
  // Published six hours before the close: counts as a full day.
  assert.equal(daysOnline(beforeClose(0.25), afterClose), 1);
  // While the vote is running the clock stops at "now", not at the close.
  const midway = new Date(close.getTime() - 4 * DAY);
  assert.equal(daysOnline(beforeClose(10), midway), 6);
});

test("votes per day decide, not raw totals", () => {
  assert.equal(votesPerDay(40, beforeClose(10), afterClose), 4);
  assert.equal(votesPerDay(15, beforeClose(3), afterClose), 5);
  // 3 votes in the last hour is 3 per day, not 72.
  assert.equal(votesPerDay(3, beforeClose(1 / 24), afterClose), 3);

  const ranked = rankStandings(
    [
      { id: "a", code: "R-001", category: "6-9", publishedAt: beforeClose(10), votes: 40 },
      { id: "b", code: "R-002", category: "6-9", publishedAt: beforeClose(3), votes: 15 },
      { id: "c", code: "R-003", category: "6-9", publishedAt: beforeClose(0.1), votes: 3 },
    ],
    afterClose,
  );
  // The late drawing with fewer votes but a better rate is first.
  assert.deepEqual(ranked.map((r) => r.code), ["R-002", "R-001", "R-003"]);
  assert.deepEqual(ranked.map((r) => r.position), [1, 2, 3]);
  assert.ok(ranked.every((r) => !r.tied));
});

test("ties share a position and are flagged; the code never picks", () => {
  const ranked = rankStandings(
    [
      { id: "a", code: "E-005", category: "3-5", publishedAt: beforeClose(4), votes: 20 },
      { id: "b", code: "E-002", category: "3-5", publishedAt: beforeClose(2), votes: 10 },
      { id: "c", code: "E-009", category: "3-5", publishedAt: beforeClose(3), votes: 6 },
      { id: "d", code: "E-001", category: "3-5", publishedAt: beforeClose(6), votes: 12 },
      { id: "e", code: "E-007", category: "3-5", publishedAt: beforeClose(5), votes: 0 },
    ],
    afterClose,
  );
  // 5/day twice, 2/day twice, 0.
  assert.deepEqual(ranked.map((r) => r.code), ["E-002", "E-005", "E-001", "E-009", "E-007"]);
  assert.deepEqual(ranked.map((r) => r.position), [1, 1, 3, 3, 5]);
  assert.deepEqual(ranked.map((r) => r.tied), [true, true, true, true, false]);
  // Thirds do not tie by float noise: 1/3 + 1/3 + 1/3 style rates still match.
  const thirds = rankStandings(
    [
      { id: "x", code: "P-001", category: "3-5", publishedAt: beforeClose(3), votes: 1 },
      { id: "y", code: "P-002", category: "3-5", publishedAt: beforeClose(6), votes: 2 },
    ],
    afterClose,
  );
  assert.deepEqual(thirds.map((r) => r.position), [1, 1]);
});

test("each age group is ranked on its own", () => {
  const ranked = rankByCategory(
    [
      { id: "a", code: "R-001", category: "3-5", publishedAt: beforeClose(2), votes: 2 },
      { id: "b", code: "R-002", category: "6-9", publishedAt: beforeClose(2), votes: 50 },
      { id: "c", code: "R-003", category: "10-14", publishedAt: beforeClose(2), votes: 8 },
      { id: "d", code: "R-004", category: "10-14", publishedAt: beforeClose(2), votes: 9 },
    ],
    afterClose,
  );
  assert.equal(ranked["3-5"][0].code, "R-001");
  assert.equal(ranked["3-5"][0].position, 1);
  assert.equal(ranked["6-9"].length, 1);
  assert.deepEqual(ranked["10-14"].map((r) => r.code), ["R-004", "R-003"]);
});

test("burst flag: many first-time e-mails in 30 minutes, old voters do not count", () => {
  const at = (minutes) => new Date(Date.UTC(2026, 10, 20, 10, minutes)).toISOString();
  const votes = [];
  // Ten brand-new addresses on drawing A within 20 minutes.
  for (let i = 0; i < 10; i += 1) {
    votes.push({ drawingId: "A", emailHash: `new-${i}`, createdAt: at(i * 2) });
  }
  // The same ten then vote for B: no longer first-time, so B has no burst.
  for (let i = 0; i < 10; i += 1) {
    votes.push({ drawingId: "B", emailHash: `new-${i}`, createdAt: at(30 + i) });
  }
  // Ten new addresses on C, but spread over ten hours.
  for (let i = 0; i < 10; i += 1) {
    votes.push({ drawingId: "C", emailHash: `slow-${i}`, createdAt: at(100 + i * 60) });
  }
  const bursts = voteBursts(votes);
  assert.equal(bursts.get("A"), 10);
  assert.equal(bursts.get("B"), undefined);
  assert.equal(bursts.get("C"), 1);
  assert.equal(burstIsSuspicious(bursts.get("A")), true);
  assert.equal(burstIsSuspicious(BURST_THRESHOLD - 1), false);
});

/* --------------------------------------------------------- gallery order --- */

test("gallery order: stable per seed, different across seeds, never by votes", () => {
  const items = Array.from({ length: 12 }, (_, i) => ({
    code: `R-${String(i + 1).padStart(3, "0")}`,
  }));
  const first = stableShuffle(items, 12345).map((i) => i.code);
  // Same seed, same order, whatever order the store listed them in.
  assert.deepEqual(stableShuffle([...items].reverse(), 12345).map((i) => i.code), first);
  assert.notDeepEqual(stableShuffle(items, 54321).map((i) => i.code), first);
  assert.deepEqual([...first].sort(), items.map((i) => i.code));

  assert.equal(parseGallerySeed("4294967295"), 4294967295);
  assert.equal(parseGallerySeed("4294967296"), null);
  assert.equal(parseGallerySeed("abc"), null);
  assert.equal(parseGallerySeed(undefined), null);
});

/* --------------------------------------------------- publish preconditions --- */

test("publishing needs gallery consent, a photo and depus/expus", () => {
  const ok = { consentGallery: true, status: "depus", imageWeb: "/x.jpg" };
  assert.equal(drawingPublishBlock(ok), null);
  assert.equal(drawingPublishBlock({ ...ok, status: "expus" }), null);
  assert.equal(drawingPublishBlock({ ...ok, consentGallery: false }), "no_consent");
  assert.equal(drawingPublishBlock({ ...ok, imageWeb: null }), "no_image");
  for (const status of ["inregistrat", "selectat", "returnat"]) {
    assert.equal(drawingPublishBlock({ ...ok, status }), "bad_status", status);
  }
});

test("gallery consent defaults to false and is independent of reproduction", async () => {
  const withoutGallery = { ...baseInput };
  delete withoutGallery.consentGallery;
  const plain = await db.createDrawingEntry(withoutGallery);
  assert.equal(plain.entry.consentGallery, false);
  assert.equal(plain.entry.publishedAt, null);
  assert.equal(plain.entry.voteWinner, false);

  // Gallery yes, cups no: publishable, keeps the chosen attribution, not printable.
  const galleryOnly = await db.createDrawingEntry({
    ...baseInput,
    consentReproduction: false,
  });
  assert.equal(galleryOnly.entry.consentGallery, true);
  assert.equal(galleryOnly.entry.attribution, "first-name-age");

  // Neither: nothing to attribute anywhere.
  const neither = await db.createDrawingEntry({
    ...baseInput,
    consentReproduction: false,
    consentGallery: false,
  });
  assert.equal(neither.entry.attribution, "none");
});

test("memory adapter: publish is refused step by step, then allowed", async () => {
  const noConsent = await db.createDrawingEntry({ ...baseInput, consentGallery: false });
  await db.setDrawingStatus(noConsent.entry.id, "depus", "barista");
  await db.setDrawingImage(noConsent.entry.id, IMAGE);
  assert.deepEqual(await db.publishDrawing(noConsent.entry.id), {
    status: "blocked",
    reason: "no_consent",
  });

  const created = await db.createDrawingEntry(baseInput);
  const id = created.entry.id;
  assert.deepEqual(await db.publishDrawing(id), { status: "blocked", reason: "bad_status" });
  await db.setDrawingStatus(id, "depus", "barista");
  assert.deepEqual(await db.publishDrawing(id), { status: "blocked", reason: "no_image" });
  await db.setDrawingImage(id, IMAGE);

  const t0 = new Date("2026-11-18T09:00:00Z");
  const published = await db.publishDrawing(id, t0);
  assert.equal(published.status, "published");
  assert.equal(published.entry.publishedAt, t0.toISOString());
  assert.equal(drawingIsLive(published.entry), true);
  assert.ok((await db.listPublishedDrawings()).some((e) => e.id === id));

  // Taken down: gone from the gallery. Put back: the clock is the first one.
  const down = await db.unpublishDrawing(id, new Date("2026-11-19T09:00:00Z"));
  assert.equal(drawingIsLive(down), false);
  assert.ok(!(await db.listPublishedDrawings()).some((e) => e.id === id));
  const again = await db.publishDrawing(id, new Date("2026-11-21T09:00:00Z"));
  assert.equal(again.entry.publishedAt, t0.toISOString());
  assert.equal(drawingIsLive(again.entry), true);

  assert.equal((await db.publishDrawing("no-such-id")).status, "not_found");
});

/* ------------------------------------------------------------ public payload --- */

test("public payload: no counts, no parent, no phone, no café, no ids", async () => {
  const entry = await liveEntry({ childFirstName: "Ilinca", childAge: 9 });
  const voter = hashVoterEmail("payload@example.ro", SECRET);
  await db.castVote({ drawingId: entry.id, emailHash: voter });

  const payload = publicDrawing(await db.getDrawingEntry(entry.id));
  assert.deepEqual(Object.keys(payload).sort(), [
    "age",
    "category",
    "code",
    "cupImage",
    "firstName",
    "image",
    "imageHeight",
    "imageWidth",
    "votable",
  ]);
  assert.equal(payload.votable, true);
  assert.equal(payload.firstName, "Ilinca");
  assert.equal(payload.age, 9);

  // `votable` is a boolean flag (the key itself contains "vot"): the
  // leak check runs on every other field.
  const rest = { ...payload };
  delete rest.votable;
  const json = JSON.stringify(rest);
  for (const leak of [
    "Părinte",
    "0700000077",
    "phone",
    "parent",
    "vote",
    "vot",
    "location",
    "era",
    entry.id,
    "original",
    IMAGE.original,
    "publishedAt",
  ]) {
    assert.ok(!json.includes(leak), `payload leaks ${leak}`);
  }
});

test("public attribution: without first name only the code and the age group", async () => {
  const entry = await liveEntry({ childFirstName: "Secret", childAge: 4, attribution: "none" });
  const payload = publicDrawing(entry);
  assert.equal(payload.firstName, null);
  assert.equal(payload.age, null);
  assert.equal(payload.category, "3-5");
  assert.ok(!JSON.stringify(payload).includes("Secret"));
  // No photo, no public page at all.
  assert.equal(publicDrawing({ ...entry, imageWeb: null }), null);
});

/* ------------------------------------------------------------------ voting --- */

test("one vote per drawing per verified e-mail; several drawings are fine", async () => {
  const first = await liveEntry();
  const second = await liveEntry();
  const voter = hashVoterEmail(normalizeVoterEmail("Ana.Pop@gmail.com"), SECRET);
  // The same mailbox spelled differently is the same voter.
  const sameVoter = hashVoterEmail(normalizeVoterEmail("anapop+2@googlemail.com"), SECRET);

  assert.deepEqual(await db.castVote({ drawingId: first.id, emailHash: voter }), {
    status: "voted",
  });
  assert.deepEqual(await db.castVote({ drawingId: first.id, emailHash: sameVoter }), {
    status: "already_voted",
  });
  assert.deepEqual(await db.castVote({ drawingId: second.id, emailHash: voter }), {
    status: "voted",
  });
  assert.equal(await db.hasVoted(first.id, voter), true);
  assert.equal(await db.hasVoted(second.id, "someone-else"), false);

  const votes = (await db.listDrawingVotes()).filter((v) => v.emailHash === voter);
  assert.equal(votes.length, 2);
  // What is stored about a voter: the drawing, the hash, the time.
  assert.deepEqual(Object.keys(votes[0]).sort(), ["createdAt", "drawingId", "emailHash"]);
});

test("code flow: wrong tries are capped, right code votes once, then is spent", async () => {
  const entry = await liveEntry();
  const emailHash = hashVoterEmail("cod@example.ro", SECRET);
  const now = new Date("2026-11-22T12:00:00Z");
  const expiresAt = new Date(now.getTime() + 15 * 60_000).toISOString();
  const codeHash = hashVoteCode("482913", entry.id, emailHash, SECRET);
  const wrongHash = hashVoteCode("000000", entry.id, emailHash, SECRET);
  const redeem = (hash, at = now) =>
    db.redeemVoteCode({ drawingId: entry.id, emailHash, codeHash: hash, maxAttempts: 5, now: at });

  assert.deepEqual(await redeem(codeHash), { status: "no_code" });

  await db.createVoteCode({ drawingId: entry.id, emailHash, codeHash, expiresAt });
  assert.deepEqual(await redeem(wrongHash), { status: "wrong_code", attemptsLeft: 4 });
  assert.deepEqual(await redeem(codeHash), { status: "voted" });
  // Spent: the same code cannot be replayed.
  assert.deepEqual(await redeem(codeHash), { status: "no_code" });

  // A second code for the same pair proves the address again but adds no vote.
  await db.createVoteCode({ drawingId: entry.id, emailHash, codeHash, expiresAt });
  assert.deepEqual(await redeem(codeHash), { status: "already_voted" });
  assert.equal(
    (await db.listDrawingVotes()).filter(
      (v) => v.drawingId === entry.id && v.emailHash === emailHash,
    ).length,
    1,
  );
});

test("code flow: five wrong tries kill the code, an old code expires", async () => {
  const entry = await liveEntry();
  const emailHash = hashVoterEmail("cap@example.ro", SECRET);
  const now = new Date("2026-11-22T12:00:00Z");
  const codeHash = hashVoteCode("111111", entry.id, emailHash, SECRET);
  const wrongHash = hashVoteCode("222222", entry.id, emailHash, SECRET);
  const redeem = (hash, at = now) =>
    db.redeemVoteCode({ drawingId: entry.id, emailHash, codeHash: hash, maxAttempts: 5, now: at });

  await db.createVoteCode({
    drawingId: entry.id,
    emailHash,
    codeHash,
    expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
  });
  for (const left of [4, 3, 2, 1]) {
    assert.deepEqual(await redeem(wrongHash), { status: "wrong_code", attemptsLeft: left });
  }
  assert.deepEqual(await redeem(wrongHash), { status: "too_many_attempts" });
  // Even the right code is refused now.
  assert.deepEqual(await redeem(codeHash), { status: "too_many_attempts" });
  assert.equal(await db.hasVoted(entry.id, emailHash), false);

  // A fresh code replaces the dead one; sixteen minutes later it has expired.
  await db.createVoteCode({
    drawingId: entry.id,
    emailHash,
    codeHash,
    expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
  });
  assert.deepEqual(await redeem(codeHash, new Date(now.getTime() + 16 * 60_000)), {
    status: "expired",
  });
  assert.equal(await db.hasVoted(entry.id, emailHash), false);
});

test("a drawing that is not online cannot be voted for", async () => {
  const created = await db.createDrawingEntry(baseInput);
  assert.deepEqual(await db.castVote({ drawingId: created.entry.id, emailHash: "h" }), {
    status: "not_live",
  });
  const live = await liveEntry();
  await db.unpublishDrawing(live.id);
  assert.deepEqual(await db.castVote({ drawingId: live.id, emailHash: "h" }), {
    status: "not_live",
  });
  assert.deepEqual(await db.castVote({ drawingId: "missing", emailHash: "h" }), {
    status: "not_live",
  });
});

/* ----------------------------------------------------------------- winners --- */

test("vote winner: one per age group, printable, never also a jury pick", async () => {
  const a = await liveEntry({ childAge: 12 });
  const b = await liveEntry({ childAge: 13 });

  const first = await db.setDrawingVoteWinner(a.id, true);
  assert.equal(first.status, "saved");
  assert.equal(first.replaced, null);

  // A second winner in the same group replaces the first.
  const second = await db.setDrawingVoteWinner(b.id, true);
  assert.equal(second.replaced.id, a.id);
  assert.equal((await db.getDrawingEntry(a.id)).voteWinner, false);
  assert.equal((await db.getDrawingEntry(b.id)).voteWinner, true);

  // Vote winners are decided first: the jury cannot also select this one.
  await db.setDrawingStatus(b.id, "expus", "manager");
  assert.deepEqual(await db.setDrawingStatus(b.id, "selectat", "manager"), {
    status: "invalid_transition",
  });
  // And a jury pick cannot be marked vote winner.
  await db.setDrawingStatus(a.id, "expus", "manager");
  assert.equal((await db.setDrawingStatus(a.id, "selectat", "manager")).status, "saved");
  assert.deepEqual(await db.setDrawingVoteWinner(a.id, true), { status: "is_jury_pick" });

  // No reproduction consent: in the gallery, votable, but not a cup winner.
  const galleryOnly = await liveEntry({ childAge: 11, consentReproduction: false });
  assert.deepEqual(await db.setDrawingVoteWinner(galleryOnly.id, true), {
    status: "not_eligible",
  });
  // Offline drawings cannot win either.
  const offline = await db.createDrawingEntry({ ...baseInput, childAge: 10 });
  assert.deepEqual(await db.setDrawingVoteWinner(offline.entry.id, true), {
    status: "not_live",
  });

  const cleared = await db.setDrawingVoteWinner(b.id, false);
  assert.equal(cleared.entry.voteWinner, false);
});

/* ------------------------------------------------------------------ images --- */

/** A minimal JPEG: SOI, an APP0 segment, a baseline frame header, EOI. */
function fakeJpeg(width, height) {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    height >> 8, height & 0xff, width >> 8, width & 0xff,
    0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

test("web image: a real JPEG of at most 1600 px, read from the bytes", () => {
  assert.deepEqual(jpegSize(fakeJpeg(1600, 1131)), { width: 1600, height: 1131 });
  assert.deepEqual(checkWebImage(fakeJpeg(1600, 1131)), { ok: true, width: 1600, height: 1131 });
  assert.deepEqual(checkWebImage(fakeJpeg(1601, 900)), { ok: false, reason: "dimensions" });
  assert.deepEqual(checkWebImage(fakeJpeg(900, 4000)), { ok: false, reason: "dimensions" });
  // A PNG (or anything else) named .jpg is not a JPEG.
  const png = new Uint8Array(32);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(sniffImage(png), "png");
  assert.deepEqual(checkWebImage(png), { ok: false, reason: "type" });
  assert.equal(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>")), null);
  assert.equal(sniffImage(new Uint8Array(4)), null);
});

test("resize target: longest side 1600, proportions kept, never upscaled", () => {
  assert.deepEqual(fitWithin(4032, 3024), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(3024, 4032), { width: 1200, height: 1600 });
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
});

test("file references: only shapes this app writes are accepted", () => {
  assert.equal(isPublicDrawingPath("/photos/uploads/desen-r-012-0a1b2c3d.jpg"), true);
  assert.equal(isPublicDrawingPath("/photos/uploads/pahar-e-001-0a1b2c3d.png"), true);
  assert.equal(isPublicDrawingPath("/photos/uploads/latte-0a1b2c3d.jpg"), false);
  assert.equal(isPublicDrawingPath("/photos/uploads/../../etc/passwd"), false);
  assert.equal(isOriginalKey("r-012-0a1b2c3d.heic"), true);
  assert.equal(isOriginalKey("../r-012-0a1b2c3d.jpg"), false);
  assert.equal(isOriginalKey("r-012-0a1b2c3d.svg"), false);
});

/* ------------------------------------------------------------------ export --- */

test("vote export carries hashes only; drawing export gets the gallery columns", async () => {
  const entry = await liveEntry();
  const emailHash = hashVoterEmail("export@example.ro", SECRET);
  const csv = voteExportCsv([
    {
      code: entry.code,
      category: entry.category,
      emailHash,
      createdAt: "2026-11-20T16:04:09.000Z",
    },
  ]);
  const lines = csv.split("\r\n");
  assert.equal(lines[0].slice(1), "Cod desen;Categorie;Amprentă e-mail;Momentul votului");
  assert.equal(lines[1], `${entry.code};6-9;${emailHash};20.11.2026 18:04:09`);
  assert.ok(!csv.includes("@"));

  const drawings = drawingExportCsv([
    {
      code: entry.code,
      locationName: "ERA Shopping Park",
      childFirstName: entry.childFirstName,
      childAge: entry.childAge,
      category: entry.category,
      parentName: entry.parentName,
      phone: entry.phone,
      consentReproduction: true,
      attribution: "first-name-age",
      consentPhoto: false,
      circleOptIn: false,
      status: "depus",
      registeredVia: "counter",
      createdAt: "2026-11-20T08:00:00.000Z",
      updatedAt: "2026-11-20T08:00:00.000Z",
      consentGallery: true,
      publishedAt: "2026-11-20T10:00:00.000Z",
      online: true,
      voteWinner: false,
    },
  ]);
  assert.ok(drawings.split("\r\n")[1].endsWith(";Da;20.11.2026;Da;Nu"));
});

/* --------------------------------------------------------------- deletion --- */

test("end of campaign: votes and pending codes go with the entries", async () => {
  // Own store section: runs last, wipes everything created above.
  const entry = await liveEntry();
  await db.castVote({ drawingId: entry.id, emailHash: "to-delete" });
  await db.createVoteCode({
    drawingId: entry.id,
    emailHash: "pending",
    codeHash: "x",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  assert.ok((await db.listDrawingVotes()).length > 0);

  await db.deleteDrawingEntries();
  assert.deepEqual(await db.listDrawingVotes(), []);
  assert.deepEqual(await db.listPublishedDrawings(), []);
  assert.deepEqual(
    await db.redeemVoteCode({
      drawingId: entry.id,
      emailHash: "pending",
      codeHash: "x",
      maxAttempts: 5,
    }),
    { status: "no_code" },
  );
});
