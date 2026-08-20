import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GOLD_CONFIG,
  currentPerkPeriod,
  goldStatus,
  perkState,
  perkUsedAt,
} from "../src/lib/gold.ts";
import { DEFAULT_LOYALTY_CONFIG } from "../src/lib/program.ts";

/**
 * Gold rules under test (Roland 03.08.2026, numbers revised 07.08.2026):
 *   `cardsRequired` completed cards -> Gold; `inactivityDays` without a visit
 *   -> lapse; after a lapse, `requalifyCards` completed card(s) win it back;
 *   while Gold, one perk per period, rotating.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-08-03T12:00:00.000Z");
const REQUIRED = GOLD_CONFIG.cardsRequired;
const CARD = DEFAULT_LOYALTY_CONFIG.cycleLength;

const at = (daysAgo) => new Date(NOW.getTime() - daysAgo * DAY).toISOString();

let nextId = 1;

function stamp(daysAgo, overrides = {}) {
  return {
    id: nextId++,
    memberId: "m1",
    locationSlug: "era",
    staffId: null,
    kind: "normal",
    createdAt: at(daysAgo),
    ...overrides,
  };
}

function coffee(daysAgo) {
  return {
    id: nextId++,
    memberId: "m1",
    rewardId: "free_coffee",
    locationSlug: "era",
    staffId: null,
    createdAt: at(daysAgo),
  };
}

function upgrade(daysAgo) {
  return { ...coffee(daysAgo), rewardId: "upgrade" };
}

function perk(daysAgo, rewardId = "gold_addon") {
  return { ...coffee(daysAgo), rewardId };
}

/** A full card: daily stamps, then the free drink. */
function completedCard(endDaysAgo) {
  const stamps = [];
  for (let i = 0; i < CARD; i += 1) stamps.push(stamp(endDaysAgo + CARD - i));
  return { stamps, redemption: coffee(endDaysAgo) };
}

function history(...cards) {
  const stamps = [];
  const redemptions = [];
  for (const card of cards) {
    stamps.push(...card.stamps);
    redemptions.push(card.redemption);
  }
  return { stamps, redemptions };
}

/** `count` completed cards, the last one `lastDaysAgo` ago, 10 days apart. */
function cards(count, lastDaysAgo, gap = 10) {
  return history(
    ...Array.from({ length: count }, (_, i) =>
      completedCard(lastDaysAgo + (count - 1 - i) * gap),
    ),
  );
}

test("nobody is Gold without completed cards", () => {
  const status = goldStatus([stamp(3), stamp(2)], [], NOW);
  assert.equal(status.isGold, false);
  assert.equal(status.everGold, false);
  assert.equal(status.completedCards, 0);
  assert.equal(status.cardsRequired, REQUIRED);
});

test("one card short of the threshold is not Gold", () => {
  const { stamps, redemptions } = cards(REQUIRED - 1, 15);
  const status = goldStatus(stamps, redemptions, NOW);
  assert.equal(status.isGold, false);
  assert.equal(status.completedCards, REQUIRED - 1);
});

test("the last required card grants Gold", () => {
  const { stamps, redemptions } = cards(REQUIRED, 5);
  const status = goldStatus(stamps, redemptions, NOW);
  assert.equal(status.isGold, true);
  assert.equal(status.everGold, true);
  assert.equal(status.goldSince, at(5));
  // Last activity 5 days ago -> lapses 14 days after it, warning 3 days before.
  assert.equal(status.expiresAt, at(5 - GOLD_CONFIG.inactivityDays));
  assert.equal(
    status.warnAt,
    at(5 - GOLD_CONFIG.inactivityDays + GOLD_CONFIG.warningDays),
  );
});

test("only the free drink completes a card", () => {
  const { stamps, redemptions } = cards(REQUIRED - 1, 20);
  const status = goldStatus(
    [...stamps, stamp(5)],
    [...redemptions, upgrade(5), perk(4)],
    NOW,
  );
  assert.equal(status.isGold, false);
  assert.equal(status.completedCards, REQUIRED - 1);
});

test("any visit keeps Gold alive", () => {
  const { stamps, redemptions } = cards(REQUIRED, 30);
  // A stamp every ~10 days since qualifying: never a 14-day gap.
  const alive = [...stamps, stamp(20), stamp(10), stamp(2)];
  const status = goldStatus(alive, redemptions, NOW);
  assert.equal(status.isGold, true);
  assert.equal(status.expiresAt, at(2 - GOLD_CONFIG.inactivityDays));
});

test("14 days of silence and Gold lapses", () => {
  const { stamps, redemptions } = cards(REQUIRED, 30);
  const status = goldStatus(stamps, redemptions, NOW);
  assert.equal(status.isGold, false);
  assert.equal(status.everGold, true);
  // Lapsed exactly `inactivityDays` after the last visit (the drink at 30d).
  assert.equal(status.downgradedAt, at(30 - GOLD_CONFIG.inactivityDays));
  assert.equal(status.completedCards, 0);
  assert.equal(status.cardsRequired, GOLD_CONFIG.requalifyCards);
});

test("a gap while NOT Gold does not count against the member", () => {
  const early = completedCard(120);
  const rest = cards(REQUIRED - 1, 5);
  const status = goldStatus(
    [...early.stamps, ...rest.stamps],
    [early.redemption, ...rest.redemptions],
    NOW,
  );
  assert.equal(status.isGold, true);
});

test("after a lapse, one completed card wins Gold back", () => {
  const gone = cards(REQUIRED, 80);
  const back = completedCard(3);
  const status = goldStatus(
    [...gone.stamps, ...back.stamps],
    [...gone.redemptions, back.redemption],
    NOW,
  );
  assert.equal(status.isGold, true);
  assert.equal(status.goldSince, at(3));
});

test("gold can lapse a second time", () => {
  const first = cards(REQUIRED, 160);
  const second = completedCard(60); // re-Gold at 60, lapsed again at 46
  const status = goldStatus(
    [...first.stamps, ...second.stamps],
    [...first.redemptions, second.redemption],
    NOW,
  );
  assert.equal(status.isGold, false);
  assert.equal(status.everGold, true);
  assert.equal(status.downgradedAt, at(60 - GOLD_CONFIG.inactivityDays));
  assert.equal(status.cardsRequired, GOLD_CONFIG.requalifyCards);
});

test("the thresholds are configurable", () => {
  const { stamps, redemptions } = cards(REQUIRED, 20);

  const strict = goldStatus(stamps, redemptions, NOW, {
    ...GOLD_CONFIG,
    inactivityDays: 30,
  });
  assert.equal(strict.isGold, true, "a 30-day window survives 20 days");

  const harsh = goldStatus(stamps, redemptions, NOW, {
    ...GOLD_CONFIG,
    inactivityDays: 7,
  });
  assert.equal(harsh.isGold, false, "a 7-day window does not");

  const demanding = goldStatus(stamps, redemptions, NOW, {
    ...GOLD_CONFIG,
    cardsRequired: REQUIRED + 1,
  });
  assert.equal(demanding.isGold, false, "one card short of a raised threshold");

  const off = goldStatus(stamps, redemptions, NOW, {
    ...GOLD_CONFIG,
    enabled: false,
  });
  assert.equal(off.isGold, false, "Gold turned off in the settings");
  assert.equal(off.everGold, false);
});

test("exactly at the window edge the status still holds", () => {
  const { stamps, redemptions } = cards(REQUIRED, GOLD_CONFIG.inactivityDays);
  const status = goldStatus(stamps, redemptions, NOW);
  // `> windowMs` lapses, `=== windowMs` does not: the push at warnAt still
  // has its full 3 days to bring the member back.
  assert.equal(status.isGold, true);
});

/* -------------------------------------------------------------- perks --- */

const goldNow = () => {
  const { stamps, redemptions } = cards(REQUIRED, 2);
  return { status: goldStatus(stamps, redemptions, NOW), redemptions };
};

test("the shared clock puts every Gold member in the same period", () => {
  const { status } = goldNow();
  // Anchor 20 days before NOW, 14-day periods: period 1 (index 1) runs from
  // day 6 before NOW to day 8 after it.
  const config = {
    ...GOLD_CONFIG,
    perks: {
      ...GOLD_CONFIG.perks,
      clock: "shared",
      anchorDate: new Date(NOW.getTime() - 20 * DAY).toISOString().slice(0, 10),
    },
  };

  const period = currentPerkPeriod(status, NOW, config);
  assert.equal(period.index, 1);
  assert.equal(period.perk, "gold_coffee", "second turn of the rotation");
  assert.equal(period.toGoOnly, true);

  // A fortnight earlier the same member is in the first turn.
  const earlier = currentPerkPeriod(
    status,
    new Date(NOW.getTime() - 14 * DAY),
    config,
  );
  assert.equal(earlier.index, 0);
  assert.equal(earlier.perk, "gold_addon");
});

test("the personal clock counts from the day the member went Gold", () => {
  const { status } = goldNow();
  const config = {
    ...GOLD_CONFIG,
    perks: { ...GOLD_CONFIG.perks, clock: "personal" },
  };

  // Gold since 2 days ago -> still the first turn.
  const first = currentPerkPeriod(status, NOW, config);
  assert.equal(first.index, 0);
  assert.equal(first.perk, "gold_addon");

  // 15 days later: second turn, the extra coffee.
  const next = currentPerkPeriod(
    status,
    new Date(NOW.getTime() + 15 * DAY),
    config,
  );
  assert.equal(next.index, 1);
  assert.equal(next.perk, "gold_coffee");
});

test("one perk per period, whichever perk it was", () => {
  const { status, redemptions } = goldNow();
  const config = {
    ...GOLD_CONFIG,
    perks: { ...GOLD_CONFIG.perks, clock: "personal" },
  };
  const period = currentPerkPeriod(status, NOW, config);

  assert.equal(perkUsedAt(redemptions, period), null);
  assert.equal(perkState(status, redemptions, NOW, config).available, true);

  // Claimed yesterday — inside this period.
  const used = [...redemptions, perk(1)];
  assert.equal(perkUsedAt(used, period), at(1));
  assert.equal(perkState(status, used, NOW, config).available, false);

  // A perk from an older period does not block the current one.
  const old = [...redemptions, perk(30, "gold_coffee")];
  assert.equal(perkUsedAt(old, period), null);
});

test("a stored perk period keeps blocking after a settings change", () => {
  const { status, redemptions } = goldNow();
  const config = {
    ...GOLD_CONFIG,
    perks: { ...GOLD_CONFIG.perks, clock: "personal" },
  };
  const period = currentPerkPeriod(status, NOW, config);

  // Claimed yesterday, with the period frozen on the row — as the adapter
  // writes it.
  const claimed = {
    ...perk(1),
    perkPeriodStart: period.startsAt,
    perkPeriodEnd: period.endsAt,
  };

  // The manager re-anchors the shared rotation to today: the recomputed
  // window starts this midnight, so yesterday's TIMESTAMP falls outside it —
  // but the stored period overlaps the new window and the claim still blocks.
  const reanchored = {
    ...GOLD_CONFIG,
    perks: {
      ...GOLD_CONFIG.perks,
      clock: "shared",
      anchorDate: NOW.toISOString().slice(0, 10),
    },
  };
  const newPeriod = currentPerkPeriod(status, NOW, reanchored);
  assert.ok(
    new Date(claimed.createdAt).getTime() <
      new Date(newPeriod.startsAt).getTime(),
    "the scenario is real: the claim predates the recomputed window",
  );
  assert.equal(perkUsedAt([...redemptions, claimed], newPeriod), at(1));
  assert.equal(
    perkState(status, [...redemptions, claimed], NOW, reanchored).available,
    false,
  );
  // The same claim WITHOUT the stored period is exactly the bug being fixed:
  // the timestamp fallback lets it slip outside the recomputed window.
  assert.equal(perkUsedAt([...redemptions, perk(1)], newPeriod), null);

  // A stored period from long ago does not touch the current window.
  const ancient = {
    ...perk(40),
    perkPeriodStart: at(44),
    perkPeriodEnd: at(30),
  };
  assert.equal(perkUsedAt([...redemptions, ancient], period), null);

  // Rows without a stored period (older data) still block by timestamp.
  assert.equal(perkUsedAt([...redemptions, perk(1)], period), at(1));
});

test("no perk when the member is not Gold, or perks are off", () => {
  const notGold = goldStatus([stamp(2)], [], NOW);
  assert.equal(currentPerkPeriod(notGold, NOW), null);

  const { status } = goldNow();
  assert.equal(
    currentPerkPeriod(status, NOW, {
      ...GOLD_CONFIG,
      perks: { ...GOLD_CONFIG.perks, enabled: false },
    }),
    null,
  );

  // Anchor still in the future: the rotation has not started.
  assert.equal(
    currentPerkPeriod(status, NOW, {
      ...GOLD_CONFIG,
      perks: { ...GOLD_CONFIG.perks, anchorDate: "2027-01-01" },
    }),
    null,
  );
});

test("gold status is a replay, not a peek at the future", () => {
  const { stamps, redemptions } = cards(REQUIRED, 5);

  // Asked about a moment before the qualifying card was finished, the answer
  // must be "not Gold yet" — events after `now` have not happened.
  const beforeLast = new Date(NOW.getTime() - 6 * DAY);
  const earlier = goldStatus(stamps, redemptions, beforeLast);
  assert.equal(earlier.isGold, false);
  assert.equal(earlier.completedCards, REQUIRED - 1);

  // And at the present moment, the same history reads as Gold.
  assert.equal(goldStatus(stamps, redemptions, NOW).isGold, true);
});
