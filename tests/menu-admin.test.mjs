import assert from "node:assert/strict";
import test from "node:test";

// The memory adapter is dependency-free TS (Node strips the types), so the
// phase 5 admin surface can be tested without a bundler. The store is a
// module-level singleton: tests mutate uniquely-named rows and restore what
// they toggle, so order stays irrelevant.
import { createMemoryDb } from "../src/lib/db/memory.ts";

const db = createMemoryDb();

test("listProducts hides inactive, listAdminProducts keeps them", async () => {
  const updated = await db.updateProduct("espresso", { active: false });
  assert.equal(updated.active, false);

  const publicIds = (await db.listProducts()).map((p) => p.id);
  assert.ok(!publicIds.includes("espresso"));

  const adminIds = (await db.listAdminProducts()).map((p) => p.id);
  assert.ok(adminIds.includes("espresso"));

  await db.updateProduct("espresso", { active: true });
  const restored = (await db.listProducts()).map((p) => p.id);
  assert.ok(restored.includes("espresso"));
});

test("createProduct slugifies diacritics and dedupes ids", async () => {
  const first = await db.createProduct({
    categorySlug: "cafea",
    name: { ro: "Ceai de mentă" },
    description: { ro: "Infuzie proaspătă" },
    alcohol: true,
  });
  assert.equal(first.id, "ceai-de-menta");
  assert.equal(first.active, true);
  assert.equal(first.price, null);
  assert.equal(first.description.ro, "Infuzie proaspătă");
  assert.equal(first.alcohol, true);

  const second = await db.createProduct({
    categorySlug: "cafea",
    name: { ro: "Ceai de mentă" },
  });
  assert.equal(second.id, "ceai-de-menta-2");
});

test("updateProduct patches all manager-editable product fields", async () => {
  const product = await db.createProduct({
    categorySlug: "naturale",
    name: { ro: "Limonadă test" },
    priceFrom: 16,
  });

  const priced = await db.updateProduct(product.id, {
    price: 18,
    priceFrom: null,
  });
  assert.equal(priced.price, 18);
  assert.equal(priced.priceFrom, null);

  const scoped = await db.updateProduct(product.id, { locations: ["era"] });
  assert.deepEqual(scoped.locations, ["era"]);

  const content = await db.updateProduct(product.id, {
    categorySlug: "cafea",
    name: { ro: "Produs test editat", hu: "Szerkesztett teszttermék" },
    description: { ro: "Descriere actualizată" },
    alcohol: true,
  });
  assert.equal(content.categorySlug, "cafea");
  assert.equal(content.name.hu, "Szerkesztett teszttermék");
  assert.equal(content.description.ro, "Descriere actualizată");
  assert.equal(content.alcohol, true);

  const missing = await db.updateProduct("nu-exista", { price: 1 });
  assert.equal(missing, null);
});

test("setSeasonalProduct keeps exactly one seasonal hero", async () => {
  const product = await db.createProduct({
    categorySlug: "naturale",
    name: { ro: "Sezon test" },
  });

  const selected = await db.setSeasonalProduct(product.id, true);
  assert.equal(selected.seasonal, true);
  assert.deepEqual(
    (await db.listAdminProducts())
      .filter((item) => item.seasonal)
      .map((item) => item.id),
    [product.id],
  );

  await db.setSeasonalProduct(product.id, false);
  assert.equal(
    (await db.listAdminProducts()).filter((item) => item.seasonal).length,
    0,
  );

  // Restore the demo hero for tests that consume the singleton afterwards.
  await db.setSeasonalProduct("limonada-mango", true);
  assert.equal(await db.setSeasonalProduct("nu-exista", true), null);
});

test("updateLocation edits only the manager-editable fields", async () => {
  const updated = await db.updateLocation("gara", {
    hours: { ro: "L-D 08:00 - 20:00" },
    woltUrl: "https://wolt.com/ro/origins-gara",
    googleRating: 4.7,
    googleReviewCount: 12,
    googlePlaceId: "ChIJTestOriginsGara",
    reviewUrl:
      "https://search.google.com/local/writereview?placeid=ChIJTestOriginsGara",
  });
  assert.equal(updated.hours.ro, "L-D 08:00 - 20:00");
  assert.equal(updated.googleRating, 4.7);
  assert.equal(updated.googlePlaceId, "ChIJTestOriginsGara");
  assert.match(updated.reviewUrl, /ChIJTestOriginsGara$/);

  // Reset to the seed state: unconfirmed stays hidden in public UI.
  await db.updateLocation("gara", {
    hours: null,
    woltUrl: null,
    googleRating: null,
    googleReviewCount: null,
    googlePlaceId: null,
    reviewUrl: null,
  });

  assert.equal(await db.updateLocation("nu-exista", {}), null);
});

test("push campaigns record honestly: sent, zero passes updated", async () => {
  const campaign = await db.createPushCampaign({
    messageRo: "Marți e dublă. Vino după 14:00.",
    messageHu: null,
    segment: "all",
    staffId: "staff-manager-era",
  });
  assert.equal(campaign.passesUpdated, 0);
  assert.notEqual(campaign.sentAt, null);

  const second = await db.createPushCampaign({
    messageRo: "Duminica la Origins, de la 10:00.",
    messageHu: "Vasárnap az Originsben, 10:00-tól.",
    segment: "hu",
    staffId: null,
  });

  const list = await db.listPushCampaigns();
  assert.equal(list[0].id, second.id, "newest first");
  assert.ok(list.some((c) => c.id === campaign.id));
});

test("getStaffForSession matches role, not just location", async () => {
  const barista = await db.getStaffForSession({
    locationSlug: "era",
    role: "barista",
  });
  assert.equal(barista.role, "barista");

  const manager = await db.getStaffForSession({
    locationSlug: "era",
    role: "manager",
  });
  assert.equal(manager.role, "manager");
  assert.notEqual(barista.id, manager.id);
});

test("personal barista codes resolve to the right person", async () => {
  const staff = await db.findStaffByPin("era", "2011");
  assert.equal(staff.id, "staff-era-b1");
  assert.equal(staff.role, "barista");

  // Same code at another location is nobody.
  assert.equal(await db.findStaffByPin("rogerius", "2011"), null);
  assert.equal(await db.findStaffByPin("era", "9999"), null);

  // Session with staffId resolves that person, not the generic barista.
  const personal = await db.getStaffForSession({
    locationSlug: "era",
    role: "barista",
    staffId: "staff-era-b1",
  });
  assert.equal(personal.id, "staff-era-b1");

  // staffId smuggled from another location does not resolve.
  const crossLocation = await db.getStaffForSession({
    locationSlug: "rogerius",
    role: "barista",
    staffId: "staff-era-b1",
  });
  assert.equal(crossLocation, null);

  // The role in the signed session must match the personal staff row too.
  const escalatedRole = await db.getStaffForSession({
    locationSlug: "era",
    role: "manager",
    staffId: "staff-era-b1",
  });
  assert.equal(escalatedRole, null);
});

test("getStats reports per-barista activity, most active first", async () => {
  const stats = await db.getStats();
  assert.ok(stats.baristas.length >= 12, "baristas across all locations");
  const total = stats.baristas.reduce((sum, b) => sum + b.stamps30d, 0);
  assert.equal(total, stats.stamps30d, "every stamp belongs to someone");
  for (let i = 1; i < stats.baristas.length; i += 1) {
    assert.ok(
      stats.baristas[i - 1].stamps30d >= stats.baristas[i].stamps30d,
      "sorted by 30-day stamps",
    );
  }
});

test("getStats aggregates the seeded demo data consistently", async () => {
  const stats = await db.getStats();

  assert.equal(stats.membersTotal, 10);
  assert.equal(stats.studentsTotal, 2);
  assert.equal(stats.studentsVerified, 1);
  // Demo Opt (1 card) + Demo Nouă and Demo Zece (a full Gold qualification
  // each) — the seed follows the configured threshold, so does this count.
  const config = await db.getLoyaltyConfig();
  const expectedCards = 1 + 2 * config.gold.cardsRequired;
  assert.equal(stats.redemptionsTotal, expectedCards);
  assert.deepEqual(stats.redemptionsByReward, [
    {
      rewardId: "free_coffee",
      name: "Cafea din partea casei",
      count: expectedCards,
    },
  ]);
  assert.equal(stats.goldMembers, 1, "Demo Nouă active, Demo Zece lapsed");

  assert.ok(stats.stampsTotal >= stats.stamps30d);
  assert.ok(stats.stamps30d >= stats.stamps7d);
  assert.ok(stats.stamps7d > 0, "seed has stamps inside the last week");

  assert.equal(stats.locations.length, 5);
  const era = stats.locations.find((l) => l.slug === "era");
  assert.ok(era.stamps30d > 0);
  const lazar = stats.locations.find((l) => l.slug === "lazar");
  assert.equal(lazar.stamps30d, 0, "coming-soon location shows zeros");
});
