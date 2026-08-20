import assert from "node:assert/strict";
import test from "node:test";

// Node strips the TypeScript types on import; loyalty.ts is dependency-free
// on purpose so these rules can be tested without a bundler.
import {
  availableRewards,
  birthdayRewardAvailable,
  canRedeem,
  cardSpec,
  cycleStamps,
  formatBucharestTime,
  isDoubleStamp,
  nextStampKind,
  stampWindow,
  stampWorth,
  totalStamps,
} from "../src/lib/loyalty.ts";
import {
  DEFAULT_LOYALTY_CONFIG,
  sanitizeLoyaltyConfig,
} from "../src/lib/program.ts";

let nextId = 1;

function stamp(overrides = {}) {
  return {
    id: nextId++,
    memberId: "m1",
    locationSlug: "era",
    staffId: null,
    kind: "normal",
    createdAt: "2026-07-01T09:00:00.000Z",
    ...overrides,
  };
}

function redemption(overrides = {}) {
  return {
    id: nextId++,
    memberId: "m1",
    rewardId: "free_coffee",
    locationSlug: "era",
    staffId: null,
    createdAt: "2026-07-10T09:00:00.000Z",
    ...overrides,
  };
}

/** `count` stamps, one per day, starting from 2026-06-01. */
function series(count, kind = "normal") {
  return Array.from({ length: count }, (_, i) =>
    stamp({
      kind,
      createdAt: new Date(Date.UTC(2026, 5, 1 + i, 9)).toISOString(),
    }),
  );
}

/** The standard card as configured today: 5 stamps, no mid-card reward. */
const STANDARD = cardSpec(DEFAULT_LOYALTY_CONFIG, false);
const GOLD = cardSpec(DEFAULT_LOYALTY_CONFIG, true);

test("the free drink lands on the last stamp of the card", () => {
  assert.equal(STANDARD.cycleLength, 5);
  assert.deepEqual(
    availableRewards(series(4), [], STANDARD).map((r) => r.id),
    [],
  );
  assert.deepEqual(
    availableRewards(series(5), [], STANDARD).map((r) => r.id),
    ["free_coffee"],
  );
});

test("a Gold member is on a shorter card", () => {
  assert.equal(GOLD.cycleLength, 4);
  assert.deepEqual(
    availableRewards(series(4), [], GOLD).map((r) => r.id),
    ["free_coffee"],
  );
  // The same four stamps are not yet a full standard card.
  assert.deepEqual(availableRewards(series(4), [], STANDARD), []);
});

test("an optional mid-card reward is offered before the free drink", () => {
  const config = sanitizeLoyaltyConfig({
    ...DEFAULT_LOYALTY_CONFIG,
    midReward: { enabled: true, stampsRequired: 3 },
  });
  const spec = cardSpec(config, false);

  assert.deepEqual(
    availableRewards(series(3), [], spec).map((r) => r.id),
    ["upgrade"],
  );
  assert.deepEqual(
    availableRewards(series(5), [], spec).map((r) => r.id),
    ["upgrade", "free_coffee"],
  );
});

test("a double stamp counts twice", () => {
  assert.equal(stampWorth("normal"), 1);
  assert.equal(stampWorth("double_tuesday"), 2);
  assert.equal(stampWorth("review_bonus"), 1);

  const stamps = [...series(3), stamp({ kind: "double_tuesday" })];
  assert.equal(cycleStamps(stamps, []), 5);
  assert.deepEqual(
    availableRewards(stamps, [], STANDARD).map((r) => r.id),
    ["free_coffee"],
  );
});

test("a used reward is not offered twice on the same card", () => {
  const config = sanitizeLoyaltyConfig({
    ...DEFAULT_LOYALTY_CONFIG,
    midReward: { enabled: true, stampsRequired: 3 },
  });
  const spec = cardSpec(config, false);
  const stamps = series(5);
  const used = [
    redemption({ rewardId: "upgrade", createdAt: "2026-06-04T09:00:00.000Z" }),
  ];

  assert.deepEqual(
    availableRewards(stamps, used, spec).map((r) => r.id),
    ["free_coffee"],
  );
  assert.equal(canRedeem(stamps, used, "upgrade", spec), false);
  assert.equal(canRedeem(stamps, used, "free_coffee", spec), true);
});

test("the card restarts after the free drink is handed over", () => {
  const first = series(5);
  const reset = redemption({
    rewardId: "free_coffee",
    createdAt: "2026-06-06T10:00:00.000Z",
  });
  const after = stamp({ createdAt: "2026-06-12T09:00:00.000Z" });
  const stamps = [...first, after];
  const redemptions = [reset];

  assert.equal(cycleStamps(stamps, redemptions), 1);
  assert.equal(totalStamps(stamps), 6);
  assert.deepEqual(availableRewards(stamps, redemptions, STANDARD), []);

  // Four more stamps fill the new card.
  const more = [
    ...stamps,
    stamp({ createdAt: "2026-06-13T09:00:00.000Z" }),
    stamp({ createdAt: "2026-06-14T09:00:00.000Z" }),
    stamp({ createdAt: "2026-06-15T09:00:00.000Z" }),
    stamp({ createdAt: "2026-06-16T09:00:00.000Z" }),
  ];
  assert.equal(cycleStamps(more, redemptions), 5);
  assert.deepEqual(
    availableRewards(more, redemptions, STANDARD).map((r) => r.id),
    ["free_coffee"],
  );
});

test("surplus stamps above the card carry into the next one", () => {
  // 4 normal + 1 double on a 5-stamp card = 6; the free drink is claimed and
  // the leftover stamp opens the new card at 1, not 0.
  const stamps = [...series(4), stamp({ kind: "double_tuesday", createdAt: "2026-06-05T09:00:00.000Z" })];
  const reset = redemption({
    rewardId: "free_coffee",
    createdAt: "2026-06-05T10:00:00.000Z",
  });

  assert.equal(cycleStamps(stamps, [reset], 5), 1);
  // Callers that pass no length keep the old behaviour.
  assert.equal(cycleStamps(stamps, [reset]), 0);
  // Without any reset there is nothing to carry: everything already counts.
  assert.equal(cycleStamps(stamps, [], 5), 6);
});

test("the carry-over is capped below a full card", () => {
  // An absurd surplus (all doubles on a 3-stamp card) must not hand out a
  // free drink on a card nobody stamped yet.
  const stamps = series(5, "double_tuesday"); // worth 10
  const reset = redemption({
    rewardId: "free_coffee",
    createdAt: "2026-06-06T10:00:00.000Z",
  });
  assert.equal(cycleStamps(stamps, [reset], 3), 2);
});

test("a carried stamp survives across more than one card", () => {
  // The first card leaves one stamp behind. The second card starts with that
  // carry and receives five more, so closing it must leave one stamp again.
  // Looking only at the five raw stamps on that second card loses the carry.
  const first = [...series(4), stamp({ kind: "double_tuesday", createdAt: "2026-06-05T09:00:00.000Z" })];
  const firstReset = redemption({
    rewardId: "free_coffee",
    createdAt: "2026-06-05T10:00:00.000Z",
  });
  const second = [
    stamp({ createdAt: "2026-06-07T09:00:00.000Z" }),
    stamp({ createdAt: "2026-06-08T09:00:00.000Z" }),
    stamp({ createdAt: "2026-06-09T09:00:00.000Z" }),
    stamp({ createdAt: "2026-06-10T09:00:00.000Z" }),
    stamp({ createdAt: "2026-06-11T09:00:00.000Z" }),
  ];
  const secondReset = redemption({
    rewardId: "free_coffee",
    createdAt: "2026-06-11T10:00:00.000Z",
  });

  assert.equal(cycleStamps([...first, ...second], [firstReset], 5), 6);
  assert.equal(
    cycleStamps([...first, ...second], [firstReset, secondReset], 5),
    1,
  );
});

test("a shorter new card does not turn a closed card into a carry", () => {
  // The card that was just finished held exactly its 5 stamps. The member is
  // now Gold, so the NEXT card is 4 long — measuring the finished card
  // against 4 would carry a stamp nobody earned.
  const stamps = series(5);
  const reset = redemption({
    rewardId: "free_coffee",
    createdAt: "2026-06-06T10:00:00.000Z",
  });

  const standardLength = () => 5;
  assert.equal(
    cycleStamps(stamps, [reset], 4, standardLength),
    0,
    "no invented stamp",
  );
  // A real overshoot on that 5-stamp card still carries onto the Gold card.
  const overshot = [
    ...series(4),
    stamp({ kind: "double_tuesday", createdAt: "2026-06-05T09:00:00.000Z" }),
  ];
  assert.equal(cycleStamps(overshot, [reset], 4, standardLength), 1);
});

test("resolved progress is shared by both reward helpers", () => {
  // Overshot card claimed, then 4 fresh stamps: the carry makes 5 and the
  // free drink is earned again. Both helpers must use that same resolved
  // number instead of independently guessing how long the old card was.
  const stamps = [
    ...series(4),
    stamp({ kind: "double_tuesday", createdAt: "2026-06-05T09:00:00.000Z" }),
    stamp({ createdAt: "2026-06-07T09:00:00.000Z" }),
    stamp({ createdAt: "2026-06-08T09:00:00.000Z" }),
    stamp({ createdAt: "2026-06-09T09:00:00.000Z" }),
    stamp({ createdAt: "2026-06-10T09:00:00.000Z" }),
  ];
  const reset = redemption({
    rewardId: "free_coffee",
    createdAt: "2026-06-05T10:00:00.000Z",
  });
  const progress = cycleStamps(stamps, [reset], 5, () => 5);
  assert.deepEqual(
    availableRewards(stamps, [reset], STANDARD, progress).map((r) => r.id),
    ["free_coffee"],
  );
  assert.equal(
    canRedeem(stamps, [reset], "free_coffee", STANDARD, progress),
    true,
  );
});

test("reward helpers never invent carry when progress is unresolved", () => {
  // The finished standard card held exactly five stamps. The new Gold card
  // has only three: treating the old card as four stamps would invent a carry
  // and incorrectly make the Gold reward available.
  const stamps = [
    ...series(5),
    stamp({ createdAt: "2026-06-07T09:00:00.000Z" }),
    stamp({ createdAt: "2026-06-08T09:00:00.000Z" }),
    stamp({ createdAt: "2026-06-09T09:00:00.000Z" }),
  ];
  const reset = redemption({
    rewardId: "free_coffee",
    createdAt: "2026-06-06T10:00:00.000Z",
  });
  const progress = cycleStamps(stamps, [reset], 4, () => 5);

  assert.equal(progress, 3);
  assert.deepEqual(availableRewards(stamps, [reset], GOLD, progress), []);
  assert.equal(canRedeem(stamps, [reset], "free_coffee", GOLD, progress), false);
  assert.deepEqual(availableRewards(stamps, [reset], GOLD), []);
  assert.equal(canRedeem(stamps, [reset], "free_coffee", GOLD), false);
});

test("a Gold perk redemption does not touch the card", () => {
  const stamps = series(3);
  const perk = redemption({
    rewardId: "gold_addon",
    createdAt: "2026-06-02T10:00:00.000Z",
  });

  // Not a reset: the stamps before it still count.
  assert.equal(cycleStamps(stamps, [perk]), 3);
  assert.deepEqual(availableRewards(stamps, [perk], GOLD), []);
});

test("one stamp per member per location per 2 hours", () => {
  const now = new Date("2026-07-15T12:00:00.000Z");
  const halfAnHourAgo = stamp({ createdAt: "2026-07-15T11:30:00.000Z" });

  const blocked = stampWindow([halfAnHourAgo], "era", now);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.nextAllowedAt, "2026-07-15T13:30:00.000Z");

  // Another Origins in the meantime is a real second visit.
  assert.equal(stampWindow([halfAnHourAgo], "rogerius", now).blocked, false);

  // Three hours later the window is open again.
  const old = stamp({ createdAt: "2026-07-15T09:00:00.000Z" });
  assert.equal(stampWindow([old], "era", now).blocked, false);

  // Exactly 2 hours counts as open.
  const exact = stamp({ createdAt: "2026-07-15T10:00:00.000Z" });
  assert.equal(stampWindow([exact], "era", now).blocked, false);

  // The window length is a setting: at 4 hours the same stamp still blocks.
  assert.equal(stampWindow([exact], "era", now, 4).blocked, true);

  // A barista-granted bonus neither blocks nor is blocked.
  const bonus = stamp({
    kind: "review_bonus",
    createdAt: "2026-07-15T11:50:00.000Z",
  });
  assert.equal(stampWindow([bonus], "era", now).blocked, false);

  // No history at all.
  const empty = stampWindow([], "era", now);
  assert.deepEqual(empty, {
    blocked: false,
    lastStampAt: null,
    nextAllowedAt: null,
  });
});

test("the double-stamp window follows Europe/Bucharest, not the server clock", () => {
  // 28.07.2026 is a Tuesday. Summer: Bucharest is UTC+3.
  assert.equal(isDoubleStamp(new Date("2026-07-28T12:00:00Z")), true); // 15:00
  assert.equal(isDoubleStamp(new Date("2026-07-28T10:00:00Z")), false); // 13:00
  assert.equal(isDoubleStamp(new Date("2026-07-28T11:00:00Z")), true); // 14:00
  assert.equal(isDoubleStamp(new Date("2026-07-28T13:59:00Z")), true); // 16:59
  assert.equal(isDoubleStamp(new Date("2026-07-28T14:00:00Z")), false); // 17:00

  // 06.01.2026 is a Tuesday. Winter: Bucharest is UTC+2.
  assert.equal(isDoubleStamp(new Date("2026-01-06T12:00:00Z")), true); // 14:00
  assert.equal(isDoubleStamp(new Date("2026-01-06T11:59:00Z")), false); // 13:59
  assert.equal(isDoubleStamp(new Date("2026-01-06T15:00:00Z")), false); // 17:00

  // Same hour, wrong day.
  assert.equal(isDoubleStamp(new Date("2026-07-29T12:00:00Z")), false);

  assert.equal(nextStampKind(new Date("2026-07-28T12:00:00Z")), "double_tuesday");
  assert.equal(nextStampKind(new Date("2026-07-29T12:00:00Z")), "normal");

  assert.equal(formatBucharestTime("2026-07-28T12:00:00Z"), "15:00");
  assert.equal(formatBucharestTime("2026-01-06T12:34:00Z"), "14:34");
  // Midnight must read 00:xx, never 24:xx.
  assert.equal(formatBucharestTime("2026-01-05T22:05:00Z"), "00:05");
});

test("the birthday drink follows the Bucharest calendar and its window", () => {
  const birth = { day: 10, month: 8, year: 1994 };
  const on = { enabled: true, windowDays: 7 };

  // 09.08 21:30 UTC is already 10.08 00:30 in Bucharest (UTC+3): the café's
  // calendar decides, not the server's.
  assert.equal(
    birthdayRewardAvailable(birth, [], new Date("2026-08-09T21:30:00Z"), on),
    true,
  );
  assert.equal(
    birthdayRewardAvailable(birth, [], new Date("2026-08-09T12:00:00Z"), on),
    false,
    "the day before is not the birthday",
  );
  // Last day of the window, then one past it.
  assert.equal(
    birthdayRewardAvailable(birth, [], new Date("2026-08-17T12:00:00Z"), on),
    true,
  );
  assert.equal(
    birthdayRewardAvailable(birth, [], new Date("2026-08-18T12:00:00Z"), on),
    false,
  );

  // windowDays 0: the day itself only.
  const dayOnly = { enabled: true, windowDays: 0 };
  assert.equal(
    birthdayRewardAvailable(birth, [], new Date("2026-08-10T12:00:00Z"), dayOnly),
    true,
  );
  assert.equal(
    birthdayRewardAvailable(birth, [], new Date("2026-08-11T12:00:00Z"), dayOnly),
    false,
  );

  // Off by default, and off means off.
  assert.equal(
    birthdayRewardAvailable(birth, [], new Date("2026-08-10T12:00:00Z")),
    false,
  );
  assert.equal(
    birthdayRewardAvailable(
      birth,
      [],
      new Date("2026-08-10T12:00:00Z"),
      { enabled: false, windowDays: 7 },
    ),
    false,
  );

  // Legacy rows without a birthdate are simply never eligible.
  assert.equal(
    birthdayRewardAvailable(
      { day: null, month: null, year: null },
      [],
      new Date("2026-08-10T12:00:00Z"),
      on,
    ),
    false,
  );
});

test("one birthday drink per birthday, across New Year too", () => {
  const on = { enabled: true, windowDays: 7 };
  const claim = (createdAt) =>
    redemption({ rewardId: "birthday_drink", createdAt });

  // Claimed inside the window: the rest of the window is closed.
  const birth = { day: 10, month: 8, year: 1994 };
  assert.equal(
    birthdayRewardAvailable(
      birth,
      [claim("2026-08-11T09:00:00Z")],
      new Date("2026-08-14T12:00:00Z"),
      on,
    ),
    false,
  );
  // Last year's claim does not touch this year's birthday.
  assert.equal(
    birthdayRewardAvailable(
      birth,
      [claim("2025-08-12T09:00:00Z")],
      new Date("2026-08-10T12:00:00Z"),
      on,
    ),
    true,
  );

  // A December birthday spills into January: still claimable on 03.01, and a
  // claim before New Year closes the whole window, not just its December part.
  const december = { day: 30, month: 12, year: 1990 };
  assert.equal(
    birthdayRewardAvailable(december, [], new Date("2027-01-03T12:00:00Z"), on),
    true,
  );
  assert.equal(
    birthdayRewardAvailable(
      december,
      [claim("2026-12-31T09:00:00Z")],
      new Date("2027-01-03T12:00:00Z"),
      on,
    ),
    false,
  );

  // 29 February rolls to 1 March in a non-leap year: the drink exists every
  // year, never only in leap years.
  const leap = { day: 29, month: 2, year: 2004 };
  assert.equal(
    birthdayRewardAvailable(leap, [], new Date("2026-03-01T12:00:00Z"), on),
    true,
  );
});

test("the double-stamp day and hours come from the settings", () => {
  // Wednesdays 09:00-12:00 instead of Tuesday afternoon.
  const wednesday = { enabled: true, weekday: 3, fromHour: 9, toHour: 12 };
  assert.equal(isDoubleStamp(new Date("2026-07-29T07:00:00Z"), wednesday), true);
  assert.equal(isDoubleStamp(new Date("2026-07-28T07:00:00Z"), wednesday), false);
  assert.equal(
    nextStampKind(new Date("2026-07-29T07:00:00Z"), wednesday),
    "double_tuesday",
  );

  // Turned off entirely: no stamp is ever worth two.
  const off = { ...wednesday, enabled: false };
  assert.equal(isDoubleStamp(new Date("2026-07-29T07:00:00Z"), off), false);
  assert.equal(nextStampKind(new Date("2026-07-29T07:00:00Z"), off), "normal");
});
