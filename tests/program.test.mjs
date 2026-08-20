import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LOYALTY_CONFIG,
  doubleStampText,
  sanitizeLoyaltyConfig,
} from "../src/lib/program.ts";
import { createMemoryDb } from "../src/lib/db/memory.ts";
import { memberCard } from "../src/lib/card.ts";
import {
  birthdayRule,
  cardSummary,
  formatLei,
  freeDrinkRule,
  goldPerksRule,
  rewardValueCapRule,
} from "../src/lib/program-copy.ts";

/**
 * The program is data now: whatever the manager saves has to survive the
 * round trip and reach both the card logic and the public copy.
 */

const db = createMemoryDb();

test("the defaults are the program agreed on 07.08.2026", () => {
  const c = DEFAULT_LOYALTY_CONFIG;
  assert.equal(c.cycleLength, 5, "5 + 1 on the standard card");
  assert.equal(c.midReward.enabled, false, "no mid-card reward");
  assert.equal(c.gold.cardsRequired, 4, "Gold after 4 completed cards");
  assert.equal(c.gold.cycleLength, 4, "4 + 1 on the Gold card");
  assert.equal(c.gold.perks.periodDays, 14);
  assert.deepEqual(c.gold.perks.rotation, ["gold_addon", "gold_coffee"]);
  assert.equal(c.gold.perks.toGoOnly, true, "perks are takeaway only");
});

test("nonsense values fall back instead of breaking the card", () => {
  const config = sanitizeLoyaltyConfig({
    cycleLength: "abc",
    stampWindowHours: -5,
    midReward: { enabled: true, stampsRequired: 99 },
    doubleStamp: { enabled: true, weekday: 12, fromHour: 20, toHour: 3 },
    gold: { perks: { rotation: ["nope"], clock: "whatever" } },
    names: { free_coffee: { ro: "   " } },
  });

  assert.equal(config.cycleLength, DEFAULT_LOYALTY_CONFIG.cycleLength);
  assert.equal(config.stampWindowHours, 1, "anti-abuse can never be disabled");
  assert.ok(
    config.midReward.stampsRequired < config.cycleLength,
    "a mid-card reward always lands before the free drink",
  );
  assert.ok(config.doubleStamp.weekday <= 6);
  assert.ok(
    config.doubleStamp.toHour > config.doubleStamp.fromHour,
    "the double-stamp window is never empty",
  );
  assert.deepEqual(
    config.gold.perks.rotation,
    DEFAULT_LOYALTY_CONFIG.gold.perks.rotation,
  );
  assert.equal(config.gold.perks.clock, "shared");
  assert.equal(
    config.names.free_coffee.ro,
    DEFAULT_LOYALTY_CONFIG.names.free_coffee.ro,
    "a blank name keeps the old one",
  );
});

test("related settings are sanitized as one safe program", () => {
  const config = sanitizeLoyaltyConfig({
    cycleLength: 5,
    stampWindowHours: 0,
    gold: {
      inactivityDays: 7,
      warningDays: 30,
      cycleLength: 5,
      perks: {
        anchorDate: "2026-02-31",
        rotation: [
          "gold_coffee",
          "gold_coffee",
          "gold_addon",
          "gold_coffee",
        ],
      },
    },
  });

  assert.ok(config.gold.cycleLength < config.cycleLength, "Gold stays better");
  assert.equal(config.gold.cycleLength, DEFAULT_LOYALTY_CONFIG.gold.cycleLength);
  assert.equal(config.gold.warningDays, 7, "warning cannot predate Gold itself");
  assert.equal(
    config.gold.perks.anchorDate,
    DEFAULT_LOYALTY_CONFIG.gold.perks.anchorDate,
    "a rolled-over calendar date is rejected",
  );
  assert.deepEqual(config.gold.perks.rotation, ["gold_coffee", "gold_addon"]);
  assert.equal(config.stampWindowHours, 1);

  const tiny = sanitizeLoyaltyConfig({
    cycleLength: 1,
    gold: { cycleLength: 1 },
  });
  assert.ok(tiny.gold.cycleLength < tiny.cycleLength);

  const leapDay = sanitizeLoyaltyConfig({
    gold: { perks: { anchorDate: "2028-02-29" } },
  });
  assert.equal(leapDay.gold.perks.anchorDate, "2028-02-29");
});

test("saving a partial change keeps the rest of the program", async () => {
  const before = await db.getLoyaltyConfig();
  const saved = await db.updateLoyaltyConfig({ cycleLength: 7 });

  assert.equal(saved.cycleLength, 7);
  assert.equal(saved.gold.cardsRequired, before.gold.cardsRequired);
  assert.ok(saved.updatedAt, "the save is stamped");

  const read = await db.getLoyaltyConfig();
  assert.equal(read.cycleLength, 7);

  await db.updateLoyaltyConfig({ cycleLength: before.cycleLength });
});

test("changing the card changes what a member is owed", async () => {
  const member = await db.findMemberByPhone("0700000004"); // Demo Patru
  assert.ok(member, "the seed has a member with a full card");

  const stamps = await db.getMemberStamps(member.id);
  const redemptions = await db.getMemberRedemptions(member.id);

  const before = await db.getLoyaltyConfig();
  assert.deepEqual(
    memberCard(stamps, redemptions, before).rewards.map((r) => r.id),
    ["free_coffee"],
  );

  // A longer card: the same stamps no longer reach the free drink.
  const longer = await db.updateLoyaltyConfig({
    cycleLength: before.cycleLength + 2,
  });
  assert.deepEqual(memberCard(stamps, redemptions, longer).rewards, []);

  await db.updateLoyaltyConfig({ cycleLength: before.cycleLength });
});

test("the reward value cap is off by default and sanitizes to lei", () => {
  assert.equal(DEFAULT_LOYALTY_CONFIG.rewardValueCap, null, "default: no cap");
  assert.equal(sanitizeLoyaltyConfig({}).rewardValueCap, null);

  assert.equal(sanitizeLoyaltyConfig({ rewardValueCap: 25 }).rewardValueCap, 25);
  assert.equal(
    sanitizeLoyaltyConfig({ rewardValueCap: 19.999 }).rewardValueCap,
    20,
    "rounded to bani",
  );
  // Nonsense turns the cap OFF, never invents one.
  assert.equal(sanitizeLoyaltyConfig({ rewardValueCap: -3 }).rewardValueCap, null);
  assert.equal(sanitizeLoyaltyConfig({ rewardValueCap: "abc" }).rewardValueCap, null);
});

test("the cap sentence exists only while a cap is set", () => {
  assert.equal(rewardValueCapRule(DEFAULT_LOYALTY_CONFIG), null);

  const capped = sanitizeLoyaltyConfig({
    ...DEFAULT_LOYALTY_CONFIG,
    rewardValueCap: 1000,
  });
  const rule = rewardValueCapRule(capped);
  assert.match(rule.ro, /cel mult 1\.000,00 lei/);
  assert.match(rule.hu, /1\.000,00 lej/);
  assert.match(rule.en, /up to 1\.000,00 lei/);

  // Romanian money formatting: dot thousands, comma decimals, always bani.
  assert.equal(formatLei(25), "25,00");
  assert.equal(formatLei(19.5), "19,50");
  assert.equal(formatLei(1234567.89), "1.234.567,89");
});

test("the birthday drink is off by default and its copy follows", () => {
  assert.equal(DEFAULT_LOYALTY_CONFIG.birthday.enabled, false);
  assert.equal(birthdayRule(DEFAULT_LOYALTY_CONFIG), null, "off = no sentence");

  const on = sanitizeLoyaltyConfig({
    ...DEFAULT_LOYALTY_CONFIG,
    birthday: { enabled: true, windowDays: 7 },
  });
  assert.match(birthdayRule(on).ro, /De ziua ta/);
  assert.match(birthdayRule(on).ro, /următoarele 7 zile/);
  assert.match(birthdayRule(on).hu, /szülinapodon/);
  assert.match(birthdayRule(on).en, /within the next 7 days/);

  const dayOnly = sanitizeLoyaltyConfig({
    ...DEFAULT_LOYALTY_CONFIG,
    birthday: { enabled: true, windowDays: 0 },
  });
  assert.match(birthdayRule(dayOnly).ro, /în ziua respectivă, la casă/);

  // Nonsense window falls back instead of breaking the rule.
  const weird = sanitizeLoyaltyConfig({
    birthday: { enabled: true, windowDays: 999 },
  });
  assert.ok(weird.birthday.windowDays <= 30);
});

test("the birthday drink flows through the adapter end to end", async () => {
  const NOW = new Date("2026-08-10T12:00:00.000Z");
  await db.updateLoyaltyConfig({ birthday: { enabled: true, windowDays: 7 } });

  const created = await db.createMember({
    name: "Test Aniversare",
    phone: "0745 222 333",
    birthDay: 10,
    birthMonth: 8,
    birthYear: 1994,
    lang: "ro",
    isStudent: false,
    consentVersion: "test",
    now: NOW,
  });
  assert.equal(created.status, "created");
  const { member } = created;

  const rewards = await db.listAvailableRewards(member, NOW);
  assert.ok(
    rewards.some((r) => r.id === "birthday_drink"),
    "birthday inside the window: the barista sees the drink",
  );

  const redeemed = await db.redeemReward({
    memberId: member.id,
    rewardId: "birthday_drink",
    locationSlug: "era",
    staffId: null,
    now: NOW,
  });
  assert.equal(redeemed.status, "redeemed");

  // Second attempt the next day: same birthday, no second drink.
  const again = await db.redeemReward({
    memberId: member.id,
    rewardId: "birthday_drink",
    locationSlug: "era",
    staffId: null,
    now: new Date("2026-08-11T12:00:00.000Z"),
  });
  assert.equal(again.status, "not_earned");

  // Legacy demo rows carry no birthdate and never see the reward.
  const demo = await db.findMemberByPhone("0700000001");
  const demoRewards = await db.listAvailableRewards(demo, NOW);
  assert.equal(demoRewards.some((r) => r.id === "birthday_drink"), false);

  await db.updateLoyaltyConfig({ birthday: { enabled: false, windowDays: 7 } });
});

test("redeeming a perk freezes its period on the redemption", async () => {
  const member = await db.findMemberByPhone("0700000009"); // Demo Nouă, Gold
  assert.ok(member, "the seed has an active Gold member");

  const rewards = await db.listAvailableRewards(member);
  const perk = rewards.find((r) => r.stampsRequired === 0);
  assert.ok(perk, "the Gold member has this period's perk on the table");

  const result = await db.redeemReward({
    memberId: member.id,
    rewardId: perk.id,
    locationSlug: "rogerius",
    staffId: null,
  });
  assert.equal(result.status, "redeemed");
  assert.ok(result.redemption.perkPeriodStart, "period start stored");
  assert.ok(result.redemption.perkPeriodEnd, "period end stored");

  // A card reward, by contrast, stores no period.
  const four = await db.findMemberByPhone("0700000004"); // full card
  const drink = await db.redeemReward({
    memberId: four.id,
    rewardId: "free_coffee",
    locationSlug: "rogerius",
    staffId: null,
  });
  assert.equal(drink.status, "redeemed");
  assert.equal(drink.redemption.perkPeriodStart, undefined);
});

test("the public copy states the configured numbers", () => {
  const config = sanitizeLoyaltyConfig({
    ...DEFAULT_LOYALTY_CONFIG,
    cycleLength: 6,
  });

  assert.match(freeDrinkRule(config).ro, /La 6 ștampile/);
  assert.match(cardSummary(config).ro, /6 ștampile/);
  assert.match(cardSummary(config).hu, /6 pecsét/);
  assert.match(cardSummary(config).en, /6 stamps/);

  const perks = goldPerksRule(config);
  assert.match(perks.ro, /2 săptămâni/);
  assert.match(perks.ro, /Doar la pachet\./);

  const double = doubleStampText(config.doubleStamp);
  assert.equal(double.ro, "Marțea, 14:00 - 17:00: ștampilă dublă");

  // Turned off, the sentence disappears rather than promising a dead window.
  assert.equal(
    doubleStampText({ ...config.doubleStamp, enabled: false }),
    null,
  );

  // A different day is worded correctly, not as "Marțea" with new hours.
  assert.equal(
    doubleStampText({ enabled: true, weekday: 4, fromHour: 9, toHour: 12 }).ro,
    "Joia, 09:00 - 12:00: ștampilă dublă",
  );
});

test("going Gold does not hand out a free stamp on the first Gold card", async () => {
  // The end-to-end version of the loyalty-level rule: the qualifying card was
  // 5 long and closed exactly, so the first Gold card starts empty.
  const member = await db.findMemberByPhone("0700000009"); // Demo Nouă, Gold
  assert.ok(member);

  const [stamps, redemptions, config] = await Promise.all([
    db.getMemberStamps(member.id),
    db.getMemberRedemptions(member.id),
    db.getLoyaltyConfig(),
  ]);

  const card = memberCard(stamps, redemptions, config);
  assert.equal(card.gold.isGold, true);
  assert.equal(card.spec.cycleLength, config.gold.cycleLength);
  // Two stamps since qualifying, and not one more.
  assert.equal(card.progress, 2);
});

test("a lapsed Gold card is still measured at its kept Gold length", () => {
  const config = structuredClone(DEFAULT_LOYALTY_CONFIG);
  config.gold.cardsRequired = 1;
  config.gold.requalifyCards = 2;
  config.gold.inactivityDays = 10;
  config.gold.warningDays = 2;

  let id = 10_000;
  const stampAt = (createdAt, kind = "normal") => ({
    id: id++,
    memberId: "m-history",
    locationSlug: "era",
    staffId: null,
    kind,
    createdAt,
  });
  const coffeeAt = (createdAt) => ({
    id: id++,
    memberId: "m-history",
    rewardId: "free_coffee",
    locationSlug: "era",
    staffId: null,
    createdAt,
  });

  const stamps = [
    stampAt("2026-01-01T09:00:00.000Z"),
    stampAt("2026-01-02T09:00:00.000Z"),
    stampAt("2026-01-03T09:00:00.000Z"),
    stampAt("2026-01-04T09:00:00.000Z"),
    stampAt("2026-01-05T09:00:00.000Z"),
    // This Gold card starts on 06.01, lapses after the visit on 09.01, then
    // closes with five stamps of value. Its real length is still four, so one
    // paid stamp must open the following standard card.
    stampAt("2026-01-07T09:00:00.000Z"),
    stampAt("2026-01-08T09:00:00.000Z"),
    stampAt("2026-01-09T09:00:00.000Z"),
    stampAt("2026-01-25T09:00:00.000Z", "double_tuesday"),
  ];
  const redemptions = [
    coffeeAt("2026-01-06T10:00:00.000Z"),
    coffeeAt("2026-01-25T10:00:00.000Z"),
  ];

  const card = memberCard(
    stamps,
    redemptions,
    config,
    new Date("2026-01-26T12:00:00.000Z"),
  );
  assert.equal(card.gold.isGold, false);
  assert.equal(card.spec.cycleLength, config.cycleLength);
  assert.equal(card.progress, 1);
});

test("memberCard ignores stamps and redemptions after the requested instant", () => {
  const config = structuredClone(DEFAULT_LOYALTY_CONFIG);
  config.gold.enabled = false;
  let id = 20_000;
  const stamps = [1, 2, 3, 4].map((day) => ({
    id: id++,
    memberId: "m-replay",
    locationSlug: "era",
    staffId: null,
    kind: "normal",
    createdAt: `2026-02-0${day}T09:00:00.000Z`,
  }));
  stamps.push({
    ...stamps[0],
    id: id++,
    createdAt: "2026-02-06T09:00:00.000Z",
  });
  const futureReset = {
    id: id++,
    memberId: "m-replay",
    rewardId: "free_coffee",
    locationSlug: "era",
    staffId: null,
    createdAt: "2026-02-06T10:00:00.000Z",
  };

  const card = memberCard(
    stamps,
    [futureReset],
    config,
    new Date("2026-02-05T12:00:00.000Z"),
  );
  assert.equal(card.progress, 4);
  assert.equal(card.totalStamps, 4);
  assert.deepEqual(card.cardRewards, []);
});
