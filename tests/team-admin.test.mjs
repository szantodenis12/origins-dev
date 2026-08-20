import assert from "node:assert/strict";
import test from "node:test";

// The memory adapter is dependency-free TS (Node strips the types). The store
// is a module-level singleton: tests create uniquely-named people instead of
// mutating the seeded rows other tests depend on.
import { createMemoryDb, STORE_KEY } from "../src/lib/db/memory.ts";

const db = createMemoryDb();

/** The raw singleton, for proving what the store does NOT contain. */
async function rawStore() {
  await db.listLocations(); // force the seed
  return globalThis[STORE_KEY];
}

const SEED_PINS = ["2011", "2012", "2021", "2022", "2031", "2032", "2041", "2042"];

test("the store never holds a readable code", async () => {
  const store = await rawStore();
  assert.ok(store.staffPins.length >= 8, "seed pins exist");

  for (const entry of store.staffPins) {
    assert.equal(entry.pin, undefined, "no plaintext field");
    assert.doesNotMatch(entry.pinHash, /^\d{4}$/, "hash is not a 4-digit code");
  }

  // The documented demo codes appear nowhere in the stored rows.
  const dump = JSON.stringify(store.staffPins);
  for (const pin of SEED_PINS) {
    assert.ok(!dump.includes(pin), `store leaks seed code ${pin}`);
  }
});

test("the demo seed codes still log in, hashed at seed time", async () => {
  const b1 = await db.findStaffByPin("era", "2011");
  assert.equal(b1.id, "staff-era-b1");
  const b2 = await db.findStaffByPin("rogerius", "2022");
  assert.equal(b2.id, "staff-rogerius-b2");

  assert.equal(await db.findStaffByPin("era", "2021"), null, "wrong cafenea");
  assert.equal(await db.findStaffByPin("era", "9999"), null, "unknown code");
});

test("createStaff returns an active row and a unique code, exactly once", async () => {
  const result = await db.createStaff({
    name: "Ana Testescu",
    locationSlug: "era",
    role: "barista",
  });
  assert.equal(result.status, "created");
  assert.equal(result.staff.active, true);
  assert.equal(result.staff.role, "barista");
  assert.match(result.pin, /^\d{4}$/);
  assert.notEqual(result.pin, "0000", "never the shared dev code");
  assert.notEqual(result.pin, "1111", "never the shared manager code");

  // The row is on the team list and the code logs in, at era only.
  const team = await db.listStaff("era");
  assert.ok(team.some((s) => s.id === result.staff.id));
  const login = await db.findStaffByPin("era", result.pin);
  assert.equal(login.id, result.staff.id);
  assert.equal(await db.findStaffByPin("rogerius", result.pin), null);

  // The store keeps only the hash of the freshly generated code too.
  const store = await rawStore();
  const entry = store.staffPins.find((p) => p.staffId === result.staff.id);
  assert.notEqual(entry.pinHash, result.pin);
});

test("createStaff refuses bad input with typed results", async () => {
  const empty = await db.createStaff({
    name: "   ",
    locationSlug: "era",
    role: "barista",
  });
  assert.equal(empty.status, "invalid_name");

  const absurd = await db.createStaff({
    name: "x".repeat(61),
    locationSlug: "era",
    role: "barista",
  });
  assert.equal(absurd.status, "invalid_name");

  const nowhere = await db.createStaff({
    name: "Ana Testescu",
    locationSlug: "nu-exista",
    role: "barista",
  });
  assert.equal(nowhere.status, "unknown_location");
});

test("renameStaff edits the name Statistici shows", async () => {
  const created = await db.createStaff({
    name: "Nume Vechi",
    locationSlug: "era",
    role: "barista",
  });
  assert.equal(created.status, "created");

  // A stamp attributed to this person (explicit kind skips the 2h window).
  const stamped = await db.addStamp({
    memberId: "demo-1",
    locationSlug: "era",
    staffId: created.staff.id,
    kind: "signup_promo",
  });
  assert.equal(stamped.status, "added");

  const renamed = await db.renameStaff(created.staff.id, "  Nume Nou  ");
  assert.equal(renamed.status, "renamed");
  assert.equal(renamed.staff.name, "Nume Nou");

  const stats = await db.getStats();
  const row = stats.baristas.find((b) => b.staffId === created.staff.id);
  assert.equal(row.name, "Nume Nou");

  assert.equal(
    (await db.renameStaff(created.staff.id, "")).status,
    "invalid_name",
  );
  assert.equal((await db.renameStaff("nu-exista", "Nume")).status, "not_found");
});

test("setStaffPin invalidates the old code and admits the new one", async () => {
  const created = await db.createStaff({
    name: "Reset Test",
    locationSlug: "gara",
    role: "barista",
  });
  assert.equal(created.status, "created");
  assert.ok(await db.findStaffByPin("gara", created.pin), "initial code works");

  // Manager-typed code: deterministic, so the invalidation is provable.
  const typed = await db.setStaffPin(created.staff.id, "7311");
  assert.equal(typed.status, "set");
  assert.equal(typed.pin, "7311");
  assert.equal(await db.findStaffByPin("gara", created.pin), null, "old code dead");
  assert.equal((await db.findStaffByPin("gara", "7311")).id, created.staff.id);

  // No argument generates a fresh 4-digit code that logs in.
  const reset = await db.setStaffPin(created.staff.id);
  assert.equal(reset.status, "set");
  assert.match(reset.pin, /^\d{4}$/);
  assert.equal((await db.findStaffByPin("gara", reset.pin)).id, created.staff.id);

  assert.equal((await db.setStaffPin("nu-exista")).status, "not_found");
});

test("typed codes follow the same rules as generated ones", async () => {
  const created = await db.createStaff({
    name: "Coduri Test",
    locationSlug: "oraselul",
    role: "barista",
  });
  assert.equal(created.status, "created");
  const id = created.staff.id;

  // Not four digits.
  assert.equal((await db.setStaffPin(id, "123")).status, "invalid_pin");
  assert.equal((await db.setStaffPin(id, "12a4")).status, "invalid_pin");
  assert.equal((await db.setStaffPin(id, "")).status, "invalid_pin");

  // The shared env codes stay off limits.
  assert.equal((await db.setStaffPin(id, "0000")).status, "pin_taken");
  assert.equal((await db.setStaffPin(id, "1111")).status, "pin_taken");

  // Collides with a seeded code at the same cafenea (hash-compared).
  assert.equal((await db.setStaffPin(id, "2031")).status, "pin_taken");

  // The same digits at ANOTHER cafenea are fine.
  const elsewhere = await db.createStaff({
    name: "Coduri Vecine",
    locationSlug: "rogerius",
    role: "barista",
  });
  assert.equal((await db.setStaffPin(elsewhere.staff.id, "2031")).status, "set");

  // Re-typing your own current code is not a collision with yourself.
  assert.equal((await db.setStaffPin(id, "7442")).status, "set");
  assert.equal((await db.setStaffPin(id, "7442")).status, "set");
});

test("deactivation blocks login and session, history stays attributed", async () => {
  const created = await db.createStaff({
    name: "Plecat Demo",
    locationSlug: "era",
    role: "barista",
  });
  assert.equal(created.status, "created");
  const id = created.staff.id;

  const stamped = await db.addStamp({
    memberId: "demo-2",
    locationSlug: "era",
    staffId: id,
    kind: "signup_promo",
  });
  assert.equal(stamped.status, "added");

  const off = await db.setStaffActive(id, false);
  assert.equal(off.status, "saved");
  assert.equal(off.staff.active, false);

  // The right code no longer logs in...
  assert.equal(await db.findStaffByPin("era", created.pin), null);
  // ...and a session opened before the switch dies on its next request.
  const session = await db.getStaffForSession({
    locationSlug: "era",
    role: "barista",
    staffId: id,
  });
  assert.equal(session, null);

  // The inactive row stays on the team list, distinguishable.
  const team = await db.listStaff("era");
  assert.equal(team.find((s) => s.id === id).active, false);

  // Every past stamp stays attributed in the stats.
  const stats = await db.getStats();
  const row = stats.baristas.find((b) => b.staffId === id);
  assert.equal(row.name, "Plecat Demo");
  assert.ok(row.stamps30d >= 1);

  // Reactivating restores the same code.
  await db.setStaffActive(id, true);
  assert.equal((await db.findStaffByPin("era", created.pin)).id, id);

  assert.equal((await db.setStaffActive("nu-exista", true)).status, "not_found");
});

test("a shared-code shift never borrows a named barista's identity", async () => {
  // The env PINs write a session with no staffId. It must resolve to the
  // cafenea's shared account and nothing else, or stamps scanned on the
  // common code would land on somebody's Statistici line.
  const shared = { locationSlug: "gara", role: "barista" };
  const resolved = await db.getStaffForSession(shared);
  assert.ok(resolved, "the shared account answers");
  assert.equal(resolved.shared, true);

  // Deactivate it: the shared code stops working at that cafenea instead of
  // silently falling through to a real person.
  await db.setStaffActive(resolved.id, false);
  assert.equal(await db.getStaffForSession(shared), null);

  // Personal logins at the same cafenea are untouched.
  const personal = await db.findStaffByPin("gara", "2041");
  assert.ok(personal);
  assert.equal(personal.shared, false);
  assert.ok(
    await db.getStaffForSession({
      locationSlug: "gara",
      role: "barista",
      staffId: personal.id,
    }),
  );

  await db.setStaffActive(resolved.id, true);
});

test("the shared account has no personal code to reset", async () => {
  const shared = (await db.listStaff("oraselul")).find((s) => s.shared);
  assert.ok(shared);
  const result = await db.setStaffPin(shared.id);
  assert.equal(result.status, "shared_account");
  // And the env code still gets in, because nothing was replaced.
  assert.ok(
    await db.getStaffForSession({
      locationSlug: "oraselul",
      role: shared.role,
    }),
  );
});
