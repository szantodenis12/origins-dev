import assert from "node:assert/strict";
import test from "node:test";

// GDPR on the memory adapter: erasure, consent withdrawal, and the stats
// that must stay honest around them. Same singleton-store discipline as
// members.test.mjs: every member created here uses a unique phone number.
import { createMemoryDb } from "../src/lib/db/memory.ts";
import { CONSENT_VERSION } from "../src/lib/db/index.ts";

const db = createMemoryDb();

const baseInput = {
  name: "Test GDPR",
  birthDay: 3,
  birthMonth: 3,
  birthYear: 1990,
  lang: "ro",
  isStudent: false,
  consentVersion: "test",
};

test("forgetMember removes the person but keeps the operational history", async () => {
  const created = await db.createMember({
    ...baseInput,
    phone: "0746111222",
    marketingConsent: true,
  });
  assert.equal(created.status, "created");
  const { member } = created;

  // Two stamps and a redemption to leave a trail worth keeping.
  await db.addStamp({ memberId: member.id, locationSlug: "era", staffId: "staff-era" });
  await db.addStamp({
    memberId: member.id,
    locationSlug: "rogerius",
    staffId: "staff-rogerius",
    kind: "signup_promo",
  });

  const before = await db.getStats();

  const result = await db.forgetMember(member.id);
  assert.equal(result.status, "forgotten");

  // The person is gone through every door.
  assert.equal(await db.getMember(member.id), null);
  assert.equal(await db.findMemberByPhone("0746111222"), null);
  assert.equal(await db.findMemberByPassSerial(member.passSerial), null);

  // The events are detached, not deleted: nothing resolves to the member id
  // anymore, but the café's totals do not shrink because someone left.
  assert.equal((await db.getMemberStamps(member.id)).length, 0);
  assert.equal((await db.getMemberRedemptions(member.id)).length, 0);

  const after = await db.getStats();
  assert.equal(after.membersTotal, before.membersTotal - 1);
  assert.equal(after.stampsTotal, before.stampsTotal);
  assert.equal(after.redemptionsTotal, before.redemptionsTotal);

  // The phone frees up: the person can come back later as a new member.
  const again = await db.createMember({ ...baseInput, phone: "0746111222" });
  assert.equal(again.status, "created");

  assert.equal((await db.forgetMember("nu-exista")).status, "not_found");
});

test("withdrawMarketingConsent stops promo, membership continues", async () => {
  const created = await db.createMember({
    ...baseInput,
    phone: "0746333444",
    marketingConsent: true,
  });
  assert.equal(created.status, "created");
  const { member } = created;
  assert.ok(member.marketingConsentAt);

  const result = await db.withdrawMarketingConsent(member.id);
  assert.equal(result.status, "saved");
  assert.equal(result.member.marketingConsentAt, null);
  assert.equal(result.member.marketingConsentVersion, null);

  // Everything else about the membership stands.
  const kept = await db.getMember(member.id);
  assert.equal(kept?.phone, "0746333444");
  assert.equal(kept?.consentVersion, "test");
  const stamp = await db.addStamp({
    memberId: member.id,
    locationSlug: "era",
    staffId: null,
  });
  assert.equal(stamp.status, "added");

  assert.equal(
    (await db.withdrawMarketingConsent("nu-exista")).status,
    "not_found",
  );
});

test("getStats counts members holding an older consent version", async () => {
  const before = await db.getStats();

  // A member on the current regulament does not raise the count...
  const current = await db.createMember({
    ...baseInput,
    phone: "0746555666",
    consentVersion: CONSENT_VERSION,
  });
  assert.equal(current.status, "created");
  assert.equal((await db.getStats()).consentOutdated, before.consentOutdated);

  // ...a member who accepted an older version does.
  const stale = await db.createMember({
    ...baseInput,
    phone: "0746777888",
    consentVersion: "2020-01-01",
  });
  assert.equal(stale.status, "created");
  assert.equal(
    (await db.getStats()).consentOutdated,
    before.consentOutdated + 1,
  );

  // The demo seeds sit on "demo", so the drift is visible out of the box.
  assert.ok(before.consentOutdated >= 10);
});

test("erasure redacts the member's name from the Jurnal, without deleting the trail", async () => {
  const db = createMemoryDb();
  const member = (await db.listMembers()).at(-1);

  // A manager action that names the person, exactly as the panel writes it.
  await db.recordAudit({
    staffId: "staff-era",
    staffName: "Cont comun manager",
    locationSlug: "era",
    action: "membru.retragere-marketing",
    target: member.id,
    summary: `A retras acordul promoțional pentru ${member.name}.`,
  });

  const before = await db.listAudit({ limit: 50 });
  assert.ok(
    JSON.stringify(before).includes(member.name),
    "the name is in the log to begin with",
  );

  await db.forgetMember(member.id);

  const after = await db.listAudit({ limit: 50 });
  assert.equal(
    after.length,
    before.length,
    "the trail survives: an audit log that can be deleted is worth nothing",
  );
  assert.ok(
    !JSON.stringify(after).includes(member.name),
    "but the name is gone from it",
  );
  assert.ok(
    after.some((entry) => entry.action === "membru.retragere-marketing"),
    "what happened, and who did it, is still recorded",
  );
});
