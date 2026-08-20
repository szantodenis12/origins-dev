import assert from "node:assert/strict";
import test from "node:test";

// memberCard() resolves Gold + card + rewards in one place; these tests pin
// the interactions the single-purpose suites cannot see (a lapse meeting the
// card in progress, the birthday drink meeting the reward list).
import { memberCard } from "../src/lib/card.ts";
import { DEFAULT_LOYALTY_CONFIG } from "../src/lib/program.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-08-03T12:00:00.000Z");
const at = (daysAgo) => new Date(NOW.getTime() - daysAgo * DAY).toISOString();

const GOLD_LENGTH = DEFAULT_LOYALTY_CONFIG.gold.cycleLength;
const STANDARD_LENGTH = DEFAULT_LOYALTY_CONFIG.cycleLength;
const REQUIRED = DEFAULT_LOYALTY_CONFIG.gold.cardsRequired;

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

/**
 * Qualification history: `REQUIRED` completed cards, ending 30 days before
 * NOW. Each card holds exactly `stampsPerCard` stamps so the carry-over rule
 * stays out of tests that are not about it.
 */
function qualified(stampsPerCard = GOLD_LENGTH) {
  const stamps = [];
  const redemptions = [];
  for (let card = 0; card < REQUIRED; card += 1) {
    const end = 30 + (REQUIRED - 1 - card) * 10;
    for (let i = 0; i < stampsPerCard; i += 1) {
      stamps.push(stamp(end + stampsPerCard - i));
    }
    redemptions.push(coffee(end));
  }
  return { stamps, redemptions };
}

test("while Gold is active the card is simply the Gold card", () => {
  const { stamps, redemptions } = qualified();
  // A visit every ~10 days: never a 14-day gap, Gold never lapses.
  const alive = [...stamps, stamp(20), stamp(10), stamp(2)];
  const card = memberCard(alive, redemptions, DEFAULT_LOYALTY_CONFIG, NOW);

  assert.equal(card.gold.isGold, true);
  assert.equal(card.spec.cycleLength, GOLD_LENGTH);
  assert.equal(card.keptGoldLength, false);
});

test("a lapse does not stretch the card already in progress", () => {
  // Gold at day 30, three stamps on the Gold card, then silence: Gold lapses
  // at day 13 but the member sits at 3 of 4 — not suddenly 3 of 5.
  const { stamps, redemptions } = qualified();
  const midCard = [...stamps, stamp(29), stamp(28), stamp(27)];
  const card = memberCard(midCard, redemptions, DEFAULT_LOYALTY_CONFIG, NOW);

  assert.equal(card.gold.isGold, false);
  assert.ok(card.gold.downgradedAt, "the lapse happened");
  assert.equal(card.keptGoldLength, true);
  assert.equal(card.spec.cycleLength, GOLD_LENGTH);
  assert.equal(card.progress, 3);
  assert.equal(card.remaining, 1);
});

test("the standard length applies from the card after the lapse", () => {
  // Requalifying takes 2 cards here, so finishing the kept Gold card does not
  // flip the member straight back to Gold and the next card is visibly standard.
  const config = structuredClone(DEFAULT_LOYALTY_CONFIG);
  config.gold.requalifyCards = 2;

  const { stamps, redemptions } = qualified();
  const finished = [...stamps, stamp(29), stamp(28), stamp(27), stamp(12)];
  const closed = [...redemptions, coffee(11)];
  const card = memberCard(finished, closed, config, NOW);

  assert.equal(card.gold.isGold, false);
  assert.equal(card.keptGoldLength, false, "the new card starts after the lapse");
  assert.equal(card.spec.cycleLength, STANDARD_LENGTH);
});

test("the birthday drink joins the rewards, but never the card face", () => {
  const config = structuredClone(DEFAULT_LOYALTY_CONFIG);
  config.birthday.enabled = true;

  // NOW is 03.08 in Bucharest; the member's birthday is today.
  const birth = { day: 3, month: 8, year: 1990 };
  const card = memberCard([stamp(40)], [], config, NOW, birth);

  assert.equal(card.birthdayAvailable, true);
  assert.deepEqual(
    card.rewards.map((r) => r.id),
    ["birthday_drink"],
  );
  assert.deepEqual(card.cardRewards, [], "not a card reward: the plate says nothing");

  // No birthdate passed (or none on file): nothing appears.
  assert.equal(
    memberCard([stamp(40)], [], config, NOW).birthdayAvailable,
    false,
  );
  assert.equal(
    memberCard([stamp(40)], [], config, NOW, { day: null, month: null, year: null })
      .birthdayAvailable,
    false,
  );
  // And with the mechanic off (the default), the birthdate changes nothing.
  assert.equal(
    memberCard([stamp(40)], [], DEFAULT_LOYALTY_CONFIG, NOW, birth)
      .birthdayAvailable,
    false,
  );
});

test("the finished kept-Gold card still pays out at the Gold length", () => {
  // Same member as above, one visit after the lapse: 4 stamps on a 4-stamp
  // card earn the drink even though the live status is no longer Gold.
  const { stamps, redemptions } = qualified();
  const finished = [...stamps, stamp(29), stamp(28), stamp(27), stamp(12)];
  const card = memberCard(finished, redemptions, DEFAULT_LOYALTY_CONFIG, NOW);

  assert.equal(card.gold.isGold, false);
  assert.equal(card.keptGoldLength, true);
  assert.deepEqual(
    card.rewards.map((r) => r.id),
    ["free_coffee"],
  );
});
