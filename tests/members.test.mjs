import assert from "node:assert/strict";
import test from "node:test";

// Faza 2.5: signup + phone lookup on the memory adapter, plus the pure
// phone helpers. Same singleton-store discipline as menu-admin.test.mjs:
// every member created here uses a unique phone number.
import { ageOn } from "../src/lib/age.ts";
import { createMemoryDb } from "../src/lib/db/memory.ts";
import { formatPhone, normalizePhone } from "../src/lib/phone.ts";

const db = createMemoryDb();

const baseInput = {
  name: "Test Membru",
  birthDay: 10,
  birthMonth: 6,
  birthYear: 1994,
  lang: "ro",
  isStudent: false,
  consentVersion: "test",
};

test("ageOn counts completed years, birthday inclusive", () => {
  const birth = { day: 15, month: 7, year: 2010 };
  assert.equal(ageOn(birth, new Date(2026, 6, 14)), 15); // day before
  assert.equal(ageOn(birth, new Date(2026, 6, 15)), 16); // birthday itself
  assert.equal(ageOn(birth, new Date(2026, 6, 16)), 16); // day after
  assert.equal(ageOn(birth, new Date(2027, 0, 1)), 16);
});

test("normalizePhone collapses spellings to one canonical form", () => {
  assert.equal(normalizePhone("0740 038 569"), "0740038569");
  assert.equal(normalizePhone("+40740038569"), "0740038569");
  assert.equal(normalizePhone("0040-740-038-569"), "0740038569");
  assert.equal(normalizePhone("0740.038.569"), "0740038569");
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone("1740038569"), null);
  assert.equal(normalizePhone("neam"), null);
  assert.equal(formatPhone("0740038569"), "0740 038 569");
});

test("createMember creates the web-card member", async () => {
  const result = await db.createMember({
    ...baseInput,
    name: "  Ana Test  ",
    phone: "0745 111 222",
    birthDay: 29,
    birthMonth: 2,
    birthYear: 2004,
    isStudent: true,
    marketingConsent: true,
  });

  assert.equal(result.status, "created");
  const { member } = result;
  assert.equal(member.name, "Ana Test");
  assert.equal(member.phone, "0745111222");
  assert.equal(member.birthDay, 29);
  assert.equal(member.birthMonth, 2);
  assert.equal(member.birthYear, 2004);
  assert.equal(member.isStudent, true);
  assert.equal(member.studentVerifiedAt, null);
  assert.equal(member.consentVersion, "test");
  assert.ok(member.consentAt);
  assert.equal(member.marketingConsentVersion, "test");
  assert.ok(member.marketingConsentAt);
  // Unguessable id (UUID), readable serial without 0/O/1/I.
  assert.match(member.id, /^[0-9a-f-]{36}$/);
  assert.match(member.passSerial, /^ORIG-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);

  const fetched = await db.getMember(member.id);
  assert.equal(fetched?.phone, "0745111222");
  const byRegistrationSerial = await db.findMemberByPassSerial(member.passSerial);
  assert.equal(byRegistrationSerial?.id, member.id);
});

test("duplicate phone is refused in any spelling", async () => {
  const first = await db.createMember({ ...baseInput, phone: "0745333444" });
  assert.equal(first.status, "created");

  const dupe = await db.createMember({ ...baseInput, phone: "+40 745 333 444" });
  assert.equal(dupe.status, "phone_exists");
});

test("invalid phone is rejected", async () => {
  const result = await db.createMember({ ...baseInput, phone: "12345" });
  assert.equal(result.status, "invalid_phone");
});

test("findMemberByPhone matches normalized, including demo seeds", async () => {
  const created = await db.createMember({ ...baseInput, phone: "0745555666" });
  assert.equal(created.status, "created");

  const found = await db.findMemberByPhone("+40-745-555-666");
  assert.equal(found?.id, created.member.id);

  // Seed members stay findable too (barista search at the counter).
  const demo = await db.findMemberByPhone("0700 000 001");
  assert.equal(demo?.passSerial, "ORIG-DEMO-0001");

  assert.equal(await db.findMemberByPhone("0799999999"), null);
  assert.equal(await db.findMemberByPhone("scris greșit"), null);
});

test("markReviewIntent records the first tap and never moves it", async () => {
  const created = await db.createMember({ ...baseInput, phone: "0745777888" });
  assert.equal(created.status, "created");
  const { member } = created;
  assert.equal(member.reviewIntentAt, null);

  const first = new Date("2026-08-05T10:00:00.000Z");
  const marked = await db.markReviewIntent(member.id, first);
  assert.equal(marked?.reviewIntentAt, first.toISOString());

  // A second tap a day later does not overwrite the honest first signal.
  const again = await db.markReviewIntent(
    member.id,
    new Date("2026-08-06T10:00:00.000Z"),
  );
  assert.equal(again?.reviewIntentAt, first.toISOString());

  assert.equal(await db.markReviewIntent("nu-exista"), null);
});

test("reissuePassSerial invalidates the old serial immediately", async () => {
  const created = await db.createMember({ ...baseInput, phone: "0745222333" });
  assert.equal(created.status, "created");
  const { member } = created;
  const oldSerial = member.passSerial;
  assert.ok(await db.findMemberByPassSerial(oldSerial), "old serial resolves");

  const result = await db.reissuePassSerial(member.id);
  assert.equal(result.status, "reissued");
  assert.notEqual(result.serial, oldSerial);
  assert.match(result.serial, /^ORIG-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);

  // The leaked QR is dead, the new one lives, the /card/{id} link still works.
  assert.equal(await db.findMemberByPassSerial(oldSerial), null);
  assert.equal((await db.findMemberByPassSerial(result.serial))?.id, member.id);
  assert.equal((await db.getMember(member.id))?.passSerial, result.serial);

  assert.equal(
    (await db.reissuePassSerial("nu-exista")).status,
    "not_found",
  );
});

test("a blocked card earns nothing until a manager unblocks it", async () => {
  const created = await db.createMember({ ...baseInput, phone: "0745444555" });
  assert.equal(created.status, "created");
  const { member } = created;

  const before = await db.addStamp({
    memberId: member.id,
    locationSlug: "era",
    staffId: null,
  });
  assert.equal(before.status, "added");

  const blockedAt = new Date("2026-08-07T09:00:00.000Z");
  const blocked = await db.setMemberBlocked(member.id, true, blockedAt);
  assert.equal(blocked.status, "saved");
  assert.equal(blocked.member.blockedAt, blockedAt.toISOString());

  // Scans, deliberate bonuses and redemptions all refuse, typed.
  const scan = await db.addStamp({
    memberId: member.id,
    locationSlug: "rogerius",
    staffId: null,
  });
  assert.equal(scan.status, "blocked");
  const bonus = await db.addStamp({
    memberId: member.id,
    locationSlug: "era",
    staffId: null,
    kind: "review_bonus",
  });
  assert.equal(bonus.status, "blocked");
  const redeem = await db.redeemReward({
    memberId: member.id,
    rewardId: "free_coffee",
    locationSlug: "era",
    staffId: null,
  });
  assert.equal(redeem.status, "blocked");

  // Unblocking clears the mark and the card moves again.
  const unblocked = await db.setMemberBlocked(member.id, false);
  assert.equal(unblocked.member.blockedAt, null);
  const after = await db.addStamp({
    memberId: member.id,
    locationSlug: "rogerius",
    staffId: null,
  });
  assert.equal(after.status, "added");

  assert.equal(
    (await db.setMemberBlocked("nu-exista", true)).status,
    "not_found",
  );
});

test("reviewUrlForMember prefers the last visited location with a URL", async () => {
  const { reviewUrlForMember } = await import("../src/lib/review.ts");

  // Demo Doi stamps at Rogerius, which has a review URL in the seed.
  const rogerius = await db.findMemberByPhone("0700000002");
  const rogeriusUrl = await reviewUrlForMember(db, rogerius.id);
  assert.match(rogeriusUrl, /writereview/);
  const rogeriusLocation = await db.getLocationBySlug("rogerius");
  assert.equal(rogeriusUrl, rogeriusLocation.reviewUrl);

  // Demo Șase stamps at Orășelul, which has NO listing yet: the link falls
  // back to a location that has one instead of dying.
  const oraselul = await db.findMemberByPhone("0700000006");
  const fallbackUrl = await reviewUrlForMember(db, oraselul.id);
  assert.match(fallbackUrl, /writereview/);

  // A member with no stamps at all still gets a live URL.
  const fresh = await db.createMember({ ...baseInput, phone: "0745888999" });
  assert.match(await reviewUrlForMember(db, fresh.member.id), /writereview/);
});
