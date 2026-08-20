import assert from "node:assert/strict";
import test from "node:test";

// The Jurnal on the memory adapter: append, read newest first, snapshot the
// actor's name. Same singleton-store discipline as the other suites.
import { createMemoryDb } from "../src/lib/db/memory.ts";

const db = createMemoryDb();

test("recordAudit appends and listAudit reads newest first", async () => {
  const first = await db.recordAudit({
    staffId: "staff-manager-era",
    staffName: "Cont comun manager",
    locationSlug: "era",
    action: "program.salvat",
    target: "program",
    summary: "Program modificat: cycleLength: 5 -> 6.",
    details: { changes: [{ field: "cycleLength", from: "5", to: "6" }] },
    now: new Date("2026-08-07T10:00:00.000Z"),
  });
  const second = await db.recordAudit({
    staffId: null,
    staffName: "Cont comun manager",
    locationSlug: "rogerius",
    action: "echipa.cod-nou",
    target: "staff-rogerius-b1",
    summary: "A generat cod nou pentru Barista demo unu.",
    now: new Date("2026-08-07T11:00:00.000Z"),
  });

  assert.ok(second.id > first.id, "ids grow with time");
  assert.equal(first.at, "2026-08-07T10:00:00.000Z");
  assert.equal(second.details, null, "details default to null, not undefined");

  const list = await db.listAudit();
  assert.equal(list[0].id, second.id, "newest first");
  assert.equal(list[1].id, first.id);

  const limited = await db.listAudit({ limit: 1 });
  assert.equal(limited.length, 1);
  assert.equal(limited[0].id, second.id);
});

test("the row keeps the actor's name as written, not the live one", async () => {
  const created = await db.createStaff({
    name: "Jurnal Test",
    locationSlug: "era",
    role: "barista",
  });
  assert.equal(created.status, "created");

  const event = await db.recordAudit({
    staffId: created.staff.id,
    staffName: created.staff.name,
    locationSlug: "era",
    action: "echipa.redenumire",
    target: created.staff.id,
    summary: "A redenumit pe cineva.",
  });

  // A later rename must not rewrite history: the row copied the name.
  await db.renameStaff(created.staff.id, "Alt Nume");
  const list = await db.listAudit();
  const row = list.find((entry) => entry.id === event.id);
  assert.equal(row.staffName, "Jurnal Test");
});
