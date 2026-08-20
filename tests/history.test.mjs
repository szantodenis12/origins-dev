import assert from "node:assert/strict";
import test from "node:test";

// The dispute trail on the barista panel: pure merge of stamps and
// redemptions, worded in Romanian, newest first, capped at 20.
import { memberHistory } from "../src/lib/history.ts";
import { DEFAULT_LOYALTY_CONFIG } from "../src/lib/program.ts";

const config = structuredClone(DEFAULT_LOYALTY_CONFIG);

function at(day, hour = 9) {
  return new Date(Date.UTC(2026, 6, day, hour)).toISOString();
}

test("stamps and redemptions merge newest first with worded labels", () => {
  const stamps = [
    { id: 1, memberId: "m", locationSlug: "era", staffId: "staff-era-b1", kind: "normal", createdAt: at(1) },
    { id: 2, memberId: "m", locationSlug: "era", staffId: null, kind: "double_tuesday", createdAt: at(3) },
    { id: 3, memberId: "m", locationSlug: "rogerius", staffId: "staff-rogerius", kind: "review_bonus", createdAt: at(5) },
  ];
  const redemptions = [
    { id: 1, memberId: "m", rewardId: "free_coffee", locationSlug: "era", staffId: "staff-era", createdAt: at(4) },
  ];

  const history = memberHistory(stamps, redemptions, config);

  assert.deepEqual(
    history.map((entry) => entry.label),
    [
      "Ștampilă bonus recenzie",
      config.names.free_coffee.ro,
      "Ștampilă dublă",
      "Ștampilă",
    ],
  );
  assert.deepEqual(
    history.map((entry) => entry.at),
    [at(5), at(4), at(3), at(1)],
  );
  // Location and staff pass through for the panel to resolve into names.
  assert.equal(history[0].locationSlug, "rogerius");
  assert.equal(history[3].staffId, "staff-era-b1");
  assert.equal(history[2].staffId, null);
});

test("the trail keeps the 20 newest events and drops the rest", () => {
  const stamps = Array.from({ length: 25 }, (_, i) => ({
    id: i + 1,
    memberId: "m",
    locationSlug: "era",
    staffId: null,
    kind: "normal",
    createdAt: at(1, i), // one per hour, same day
  }));

  const history = memberHistory(stamps, [], config);
  assert.equal(history.length, 20);
  assert.equal(history[0].at, at(1, 24), "newest survives");
  assert.equal(history.at(-1).at, at(1, 5), "the 5 oldest fell off");
});
