import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sealStaffSession,
  unsealStaffSession,
} from "../src/lib/admin/session-token.ts";

const SECRET = "origins-test-session-secret-32-characters-minimum";
const NOW = new Date("2026-08-04T10:00:00.000Z");

test("staff sessions round-trip only with a valid signature", () => {
  const session = {
    locationSlug: "era",
    role: "manager",
    staffId: "staff-manager-era",
  };
  const token = sealStaffSession(session, SECRET, NOW);

  assert.deepEqual(unsealStaffSession(token, SECRET, NOW), session);
  assert.equal(unsealStaffSession(token, `${SECRET}-wrong`, NOW), null);
});

test("plain JSON and tampered staff sessions are rejected", () => {
  const plain = JSON.stringify({ locationSlug: "era", role: "manager" });
  assert.equal(unsealStaffSession(plain, SECRET, NOW), null);

  const token = sealStaffSession(
    { locationSlug: "era", role: "barista" },
    SECRET,
    NOW,
  );
  const [payload, signature] = token.split(".");
  const changed = Buffer.from(
    JSON.stringify({
      ...JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
      role: "manager",
    }),
  ).toString("base64url");

  assert.equal(
    unsealStaffSession(`${changed}.${signature}`, SECRET, NOW),
    null,
  );
});

test("staff sessions expire after one shift", () => {
  const token = sealStaffSession(
    { locationSlug: "era", role: "barista" },
    SECRET,
    NOW,
  );
  const afterShift = new Date(NOW.getTime() + 12 * 60 * 60 * 1000);
  assert.equal(unsealStaffSession(token, SECRET, afterShift), null);
});
