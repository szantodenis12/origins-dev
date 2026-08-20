import assert from "node:assert/strict";
import test from "node:test";

// Retention visibility (GDPR spec §7): who is past 24 months of inactivity.
// Pure function; the deletion job itself belongs to the Supabase phase.
import { membersPastRetention, RETENTION_MONTHS } from "../src/lib/retention.ts";
import { createMemoryDb } from "../src/lib/db/memory.ts";

const NOW = new Date("2026-08-07T12:00:00.000Z");

function row(id, createdAt, lastActivityAt = null) {
  return { id, createdAt, lastActivityAt };
}

test("default window is the 24 months the privacy text promises", () => {
  assert.equal(RETENTION_MONTHS, 24);

  const due = membersPastRetention(
    [
      // Last drink 25 months ago: past the window.
      row("vechi", "2023-01-01T00:00:00.000Z", "2024-07-01T10:00:00.000Z"),
      // Active last week: safe, no matter how old the signup is.
      row("activ", "2022-01-01T00:00:00.000Z", "2026-08-01T10:00:00.000Z"),
      // Never used the card: the signup date is the floor.
      row("fantoma", "2024-06-01T00:00:00.000Z"),
      row("proaspat", "2026-05-01T00:00:00.000Z"),
    ],
    NOW,
  );
  assert.deepEqual(
    due.map((r) => r.id),
    ["vechi", "fantoma"],
  );
});

test("the deadline is calendar months, boundary inclusive", () => {
  const lastVisit = "2024-08-07T12:00:00.000Z";
  // One millisecond before the two-year mark: not due yet.
  assert.equal(
    membersPastRetention(
      [row("m", "2024-01-01T00:00:00.000Z", lastVisit)],
      new Date("2026-08-07T11:59:59.999Z"),
    ).length,
    0,
  );
  // At the mark exactly: the window has fully run out.
  assert.equal(
    membersPastRetention(
      [row("m", "2024-01-01T00:00:00.000Z", lastVisit)],
      new Date("2026-08-07T12:00:00.000Z"),
    ).length,
    1,
  );
});

test("the window length is a parameter", () => {
  const rows = [row("m", "2026-01-10T00:00:00.000Z", "2026-02-01T00:00:00.000Z")];
  assert.equal(membersPastRetention(rows, NOW, 6).length, 1);
  assert.equal(membersPastRetention(rows, NOW, 12).length, 0);
});

test("getStats surfaces the count without deleting anyone", async () => {
  const db = createMemoryDb();
  const before = await db.getStats(NOW);
  // The demo seeds are all recent, so the demo screen starts at zero.
  assert.equal(before.retentionDue, 0);

  // A member who signed up 25 months ago and never came back.
  const created = await db.createMember({
    name: "Test Inactiv",
    phone: "0747999888",
    birthDay: 1,
    birthMonth: 1,
    birthYear: 1990,
    lang: "ro",
    isStudent: false,
    consentVersion: "test",
    now: new Date("2024-07-01T10:00:00.000Z"),
  });
  assert.equal(created.status, "created");

  const after = await db.getStats(NOW);
  assert.equal(after.retentionDue, before.retentionDue + 1);
  // Visibility only: the member is still there.
  assert.ok(await db.getMember(created.member.id));

  // One stamp today pulls them back out of the overdue count.
  await db.addStamp({
    memberId: created.member.id,
    locationSlug: "era",
    staffId: null,
    now: NOW,
  });
  assert.equal((await db.getStats(NOW)).retentionDue, before.retentionDue);
});
