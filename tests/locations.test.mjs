import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemoryDb } from "../src/lib/db/memory.ts";
import { productsForLocation } from "../src/lib/menu.ts";

/**
 * Adding a cafenea from the admin: slug, staffing, menu defaults, opening.
 * Fresh adapter per test is not possible (module-level singleton store), so
 * each test uses its own distinctly named location.
 */

const db = createMemoryDb();

test("createLocation adds the cafenea with generated barista codes", async () => {
  const result = await db.createLocation({
    name: "Aurel Lazăr",
    addressRo: "Str. Aurel Lazăr 21",
    hoursRo: "L-D 09:00 - 21:00",
  });

  assert.equal(result.status, "created");
  assert.equal(result.location.slug, "aurel-lazar");
  assert.equal(result.location.comingSoon, true, "hidden until opened");
  assert.equal(result.location.servesAlcohol, null, "never guessed");
  assert.equal(result.location.address?.ro, "Str. Aurel Lazăr 21");

  // Two personal codes, 4 digits, never the shared env codes.
  assert.equal(result.staffPins.length, 2);
  for (const { pin } of result.staffPins) {
    assert.match(pin, /^\d{4}$/);
    assert.notEqual(pin, "0000");
    assert.notEqual(pin, "1111");
  }

  // The codes actually log in at the new location...
  const staff = await db.findStaffByPin("aurel-lazar", result.staffPins[0].pin);
  assert.ok(staff);
  assert.equal(staff.locationSlug, "aurel-lazar");
  assert.equal(staff.role, "barista");

  // ...and only there.
  const elsewhere = await db.findStaffByPin("era", result.staffPins[0].pin);
  assert.equal(elsewhere?.locationSlug === "aurel-lazar", false);
});

test("duplicate names are refused", async () => {
  const first = await db.createLocation({ name: "Cafeneaua Gemenii" });
  assert.equal(first.status, "created");
  const second = await db.createLocation({ name: "Cafeneaua GEMENII" });
  assert.equal(second.status, "name_exists");
});

test("a name with no letters is refused", async () => {
  const result = await db.createLocation({ name: "  ---  " });
  assert.equal(result.status, "invalid_name");
});

test("products for everyone appear at the new cafenea automatically", async () => {
  const created = await db.createLocation({ name: "Testareia" });
  assert.equal(created.status, "created");

  const products = await db.listProducts();
  const visible = productsForLocation(products, created.location);

  const everywhere = products.filter((p) => p.locations === null && !p.alcohol);
  assert.ok(everywhere.length > 0, "seed has products available everywhere");
  assert.equal(
    visible.filter((p) => p.locations === null).length,
    everywhere.length,
  );

  // Per-list products stay out until the manager ticks the new cafenea.
  const perList = visible.filter((p) => p.locations !== null);
  assert.equal(perList.length, 0);

  // Alcohol stays hidden while servesAlcohol is unconfirmed (null).
  assert.equal(visible.some((p) => p.alcohol), false);
});

test("the manager opens the cafenea by flipping comingSoon", async () => {
  const created = await db.createLocation({ name: "Deschidereia" });
  assert.equal(created.status, "created");

  const opened = await db.updateLocation("deschidereia", {
    comingSoon: false,
  });
  assert.equal(opened?.comingSoon, false);

  const listed = await db.getLocationBySlug("deschidereia");
  assert.equal(listed?.comingSoon, false);
});

test("gold members show up in the stats", async () => {
  const stats = await db.getStats();
  // Seed: Demo Nouă is Gold right now, Demo Zece lapsed. Exactly one.
  assert.equal(stats.goldMembers, 1);
});
