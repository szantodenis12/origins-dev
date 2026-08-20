import assert from "node:assert/strict";
import test from "node:test";

// The retroactive-impact check behind the /admin/setari confirmation: pure
// functions over synthetic members, no store involved.
import {
  configChanges,
  configChangeSummary,
  configImpact,
  impactIsHarmful,
  impactSentence,
} from "../src/lib/config-impact.ts";
import {
  DEFAULT_LOYALTY_CONFIG,
  sanitizeLoyaltyConfig,
} from "../src/lib/program.ts";

const NOW = new Date("2026-08-07T12:00:00.000Z");

/** `count` normal stamps at era, one per day, ending well before NOW. */
function stamps(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    memberId: "m",
    locationSlug: "era",
    staffId: null,
    kind: "normal",
    createdAt: new Date(Date.UTC(2026, 6, 1 + i, 9)).toISOString(),
  }));
}

function member(stampCount) {
  return { stamps: stamps(stampCount), redemptions: [], birth: null };
}

const base = sanitizeLoyaltyConfig(structuredClone(DEFAULT_LOYALTY_CONFIG));

function withCycle(cycleLength) {
  return sanitizeLoyaltyConfig({
    ...structuredClone(DEFAULT_LOYALTY_CONFIG),
    cycleLength,
  });
}

test("a harmless change reports zero impact", () => {
  // Renaming a reward moves no stamp and takes nothing back.
  const renamed = sanitizeLoyaltyConfig({
    ...structuredClone(DEFAULT_LOYALTY_CONFIG),
    names: {
      ...structuredClone(DEFAULT_LOYALTY_CONFIG.names),
      free_coffee: { ro: "Espresso din partea casei", hu: "x", en: "y" },
    },
  });
  const members = [member(5), member(2)];

  const impact = configImpact(members, base, renamed, NOW);
  assert.deepEqual(impact, { losesReward: 0, needsMoreStamps: 0 });
  assert.equal(impactIsHarmful(impact), false);

  // Shortening the card only helps: nobody loses, nobody needs more.
  const shorter = configImpact(members, base, withCycle(4), NOW);
  assert.deepEqual(shorter, { losesReward: 0, needsMoreStamps: 0 });
});

test("lengthening the card takes back earned rewards and adds distance", () => {
  // At 5/5 the free drink is earned; at 2/5 the member is mid-card.
  const members = [member(5), member(2)];
  const impact = configImpact(members, base, withCycle(8), NOW);

  // The full-card member loses the earned drink; both need more stamps.
  assert.deepEqual(impact, { losesReward: 1, needsMoreStamps: 2 });
  assert.equal(impactIsHarmful(impact), true);
  assert.equal(
    impactSentence(impact),
    "Cu setările astea, un membru pierde recompensa deja câștigată și 2 membri au nevoie de mai multe ștampile. Salvezi?",
  );
});

test("configChanges lists the moved leaves, old value to new", () => {
  const next = sanitizeLoyaltyConfig({
    ...structuredClone(DEFAULT_LOYALTY_CONFIG),
    cycleLength: 8,
    rewardValueCap: 25,
    birthday: { enabled: true, windowDays: 7 },
  });
  const changes = configChanges(base, next);
  const byField = Object.fromEntries(
    changes.map((change) => [change.field, change]),
  );

  assert.deepEqual(byField.cycleLength, {
    field: "cycleLength",
    from: "5",
    to: "8",
  });
  assert.deepEqual(byField.rewardValueCap, {
    field: "rewardValueCap",
    from: "gol",
    to: "25",
  });
  assert.deepEqual(byField["birthday.enabled"], {
    field: "birthday.enabled",
    from: "nu",
    to: "da",
  });
  // updatedAt is bookkeeping, never a listed change.
  assert.ok(!("updatedAt" in byField));
  assert.equal(changes.length, 3);

  assert.equal(
    configChangeSummary(changes.filter((c) => c.field === "cycleLength")),
    "Program modificat: cycleLength: 5 -> 8.",
  );
  assert.equal(configChangeSummary([]), "Program salvat, fără modificări.");
});

test("the confirmation token is server-minted and covers the warning", async () => {
  const { programConfirmToken, confirmTokenMatches } = await import(
    "../src/lib/admin/confirm-token.ts"
  );
  const config = { ...DEFAULT_LOYALTY_CONFIG, cycleLength: 9 };
  const impact = { losesReward: 3, needsMoreStamps: 12 };
  const secret = "a".repeat(32);

  const token = programConfirmToken(config, impact, secret);
  assert.equal(
    programConfirmToken(config, impact, secret),
    token,
    "same settings, same warning, same secret -> the second press validates",
  );

  // A stamp landed between the presses: the manager would be confirming
  // numbers they never saw, so the token must stop matching.
  assert.notEqual(
    programConfirmToken(config, { ...impact, needsMoreStamps: 13 }, secret),
    token,
  );

  // Editing a field between the presses re-asks.
  assert.notEqual(
    programConfirmToken({ ...config, cycleLength: 8 }, impact, secret),
    token,
  );

  // Without the secret it cannot be minted, so the warning cannot be skipped.
  assert.notEqual(programConfirmToken(config, impact, "b".repeat(32)), token);

  assert.equal(confirmTokenMatches(token, token), true);
  assert.equal(confirmTokenMatches("", token), false);
  assert.equal(confirmTokenMatches(token.slice(0, -1) + "x", token), false);
});
