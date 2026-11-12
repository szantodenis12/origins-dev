import assert from "node:assert/strict";
import test from "node:test";

// Concursul de desene 2026: the pure rules (lib/drawing.ts), the memory
// adapter flows and the CSV export. Same singleton-store discipline as the
// other suites: entries created here carry obviously fake data.
import {
  canChangeDrawingStatus,
  contestLocationForStaff,
  drawingCategory,
  drawingCode,
  drawingEligibleForPrint,
  normalizeDrawingCode,
} from "../src/lib/drawing.ts";
import { drawingExportCsv } from "../src/lib/export.ts";
import { createRateLimiter } from "../src/lib/rate-limit.ts";
import { createMemoryDb } from "../src/lib/db/memory.ts";

const db = createMemoryDb();

const baseInput = {
  location: "rogerius",
  childFirstName: "Test",
  childAge: 7,
  parentName: "Părinte Test",
  phone: "0700000099",
  consentParticipation: true,
  consentReproduction: true,
  attribution: "first-name-age",
  consentPhoto: false,
  circleOptIn: false,
  registeredVia: "web",
};

test("category derives from the age at the boundaries, 2 and 15 refused", () => {
  assert.equal(drawingCategory(2), null);
  assert.equal(drawingCategory(3), "3-5");
  assert.equal(drawingCategory(5), "3-5");
  assert.equal(drawingCategory(6), "6-9");
  assert.equal(drawingCategory(9), "6-9");
  assert.equal(drawingCategory(10), "10-14");
  assert.equal(drawingCategory(14), "10-14");
  assert.equal(drawingCategory(15), null);
  assert.equal(drawingCategory(7.5), null, "whole years only");
  assert.equal(drawingCategory(NaN), null);
});

test("codes are the location letter plus a 3-digit sequence", () => {
  assert.equal(drawingCode("rogerius", 1), "R-001");
  assert.equal(drawingCode("era", 42), "E-042");
  assert.equal(drawingCode("palatul-copiilor", 100), "P-100");
  assert.equal(normalizeDrawingCode(" r 7 "), "R-007");
  assert.equal(normalizeDrawingCode("e-012"), "E-012");
  assert.equal(normalizeDrawingCode("X-001"), null);
  assert.equal(normalizeDrawingCode("ORIG-DEMO-0001"), null);
});

test("a staff phone at the Palatul Copiilor café (seed slug gara) lands on P", () => {
  assert.equal(contestLocationForStaff("gara"), "palatul-copiilor");
  assert.equal(contestLocationForStaff("era"), "era");
  assert.equal(contestLocationForStaff("oraselul"), null);
});

test("the adapter numbers entries per location, independently", async () => {
  const r1 = await db.createDrawingEntry({ ...baseInput, location: "rogerius" });
  const e1 = await db.createDrawingEntry({ ...baseInput, location: "era" });
  const r2 = await db.createDrawingEntry({ ...baseInput, location: "rogerius" });
  const p1 = await db.createDrawingEntry({
    ...baseInput,
    location: "palatul-copiilor",
  });
  assert.equal(r1.status, "created");
  assert.equal(r1.entry.code, "R-001");
  assert.equal(e1.entry.code, "E-001");
  assert.equal(r2.entry.code, "R-002");
  assert.equal(p1.entry.code, "P-001");
  assert.equal(r2.entry.category, "6-9");
  assert.equal(r2.entry.status, "inregistrat");
  assert.equal(r2.entry.phone, "0700000099");

  // Codes are unique, lookup tolerates sloppy typing at the counter.
  const found = await db.findDrawingEntryByCode("r 2");
  assert.equal(found?.id, r2.entry.id);
  assert.equal(await db.findDrawingEntryByCode("R-999"), null);

  // Same phone twice is fine here: one parent, two children.
  const sibling = await db.createDrawingEntry({ ...baseInput, childAge: 4 });
  assert.equal(sibling.status, "created");
  assert.equal(sibling.entry.category, "3-5");
});

test("the adapter refuses bad input the way the form does", async () => {
  assert.equal(
    (await db.createDrawingEntry({ ...baseInput, childAge: 2 })).status,
    "invalid_age",
  );
  assert.equal(
    (await db.createDrawingEntry({ ...baseInput, childAge: 15 })).status,
    "invalid_age",
  );
  assert.equal(
    (await db.createDrawingEntry({ ...baseInput, phone: "12345" })).status,
    "invalid_phone",
  );
  assert.equal(
    (await db.createDrawingEntry({ ...baseInput, location: "oraselul" }))
      .status,
    "unknown_location",
  );
  assert.equal(
    (await db.createDrawingEntry({ ...baseInput, consentParticipation: false }))
      .status,
    "consent_required",
  );
  assert.equal(
    (await db.createDrawingEntry({ ...baseInput, childFirstName: "A" }))
      .status,
    "invalid_name",
  );
});

test("without reproduction consent the drawing is exhibited, never selected", async () => {
  const created = await db.createDrawingEntry({
    ...baseInput,
    location: "era",
    consentReproduction: false,
    attribution: "first-name-age",
  });
  assert.equal(created.status, "created");
  const { entry } = created;
  assert.equal(drawingEligibleForPrint(entry), false);
  // Nothing to attribute when nothing may be printed.
  assert.equal(entry.attribution, "none");

  await db.setDrawingStatus(entry.id, "depus", "barista");
  await db.setDrawingStatus(entry.id, "expus", "barista");
  const refused = await db.setDrawingStatus(entry.id, "selectat", "manager");
  assert.equal(refused.status, "not_eligible");
  assert.equal((await db.getDrawingEntry(entry.id)).status, "expus");

  // "Fără prenume" is kept when reproduction is allowed.
  const anonymous = await db.createDrawingEntry({
    ...baseInput,
    consentReproduction: true,
    attribution: "none",
  });
  assert.equal(anonymous.entry.attribution, "none");
  assert.equal(drawingEligibleForPrint(anonymous.entry), true);
});

test("status moves along the ladder; only a manager selects", async () => {
  assert.equal(canChangeDrawingStatus("inregistrat", "depus", "barista"), true);
  assert.equal(canChangeDrawingStatus("inregistrat", "expus", "barista"), false);
  assert.equal(canChangeDrawingStatus("inregistrat", "returnat", "barista"), false);
  assert.equal(canChangeDrawingStatus("depus", "returnat", "barista"), true);
  assert.equal(canChangeDrawingStatus("expus", "selectat", "barista"), false);
  assert.equal(canChangeDrawingStatus("expus", "selectat", "manager"), true);
  assert.equal(canChangeDrawingStatus("selectat", "returnat", "barista"), true);
  assert.equal(canChangeDrawingStatus("returnat", "depus", "manager"), false);

  const created = await db.createDrawingEntry({ ...baseInput, location: "era" });
  const { entry } = created;
  const now = new Date("2026-11-20T10:00:00.000Z");

  const skipped = await db.setDrawingStatus(entry.id, "expus", "manager", now);
  assert.equal(skipped.status, "invalid_transition");

  const handedIn = await db.setDrawingStatus(entry.id, "depus", "barista", now);
  assert.equal(handedIn.status, "saved");
  assert.equal(handedIn.from, "inregistrat");
  assert.equal(handedIn.entry.updatedAt, now.toISOString());

  await db.setDrawingStatus(entry.id, "expus", "barista");
  const byBarista = await db.setDrawingStatus(entry.id, "selectat", "barista");
  assert.equal(byBarista.status, "invalid_transition");
  const byManager = await db.setDrawingStatus(entry.id, "selectat", "manager");
  assert.equal(byManager.status, "saved");

  const returned = await db.setDrawingStatus(entry.id, "returnat", "barista");
  assert.equal(returned.status, "saved");
  const again = await db.setDrawingStatus(entry.id, "depus", "manager");
  assert.equal(again.status, "invalid_transition");

  assert.equal(
    (await db.setDrawingStatus("nu-exista", "depus", "manager")).status,
    "not_found",
  );
});

test("listDrawingEntries filters by location, newest first", async () => {
  const all = await db.listDrawingEntries();
  const era = await db.listDrawingEntries({ location: "era" });
  assert.ok(era.length > 0);
  assert.ok(era.every((entry) => entry.location === "era"));
  assert.ok(all.length > era.length);
  for (let i = 1; i < all.length; i += 1) {
    assert.ok(all[i - 1].createdAt >= all[i].createdAt);
  }
});

test("the CSV carries parent name and phone; the list columns never do", async () => {
  const created = await db.createDrawingEntry({
    ...baseInput,
    location: "palatul-copiilor",
    childFirstName: "Copil; Test",
    parentName: "Părinte Export",
    phone: "+40 700 000 098",
    consentPhoto: true,
    circleOptIn: true,
    now: new Date("2026-11-05T21:30:00.000Z"),
  });
  const { entry } = created;
  const csv = drawingExportCsv([
    {
      code: entry.code,
      locationName: "Palatul Copiilor",
      childFirstName: entry.childFirstName,
      childAge: entry.childAge,
      category: entry.category,
      parentName: entry.parentName,
      phone: entry.phone,
      consentReproduction: entry.consentReproduction,
      attribution: entry.attribution,
      consentPhoto: entry.consentPhoto,
      circleOptIn: entry.circleOptIn,
      status: entry.status,
      registeredVia: entry.registeredVia,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    },
  ]);
  const lines = csv.split("\r\n");
  assert.equal(csv[0], "﻿");
  assert.equal(
    lines[0].slice(1),
    "Cod;Locație;Prenume copil;Vârstă;Categorie;Părinte;Telefon;" +
      "Acord reproducere;Atribuire;Acord foto/video;Info Origins Circle;" +
      "Stare;Înscris prin;Data înscrierii;Ultima modificare;" +
      // Gallery columns, added with the online gallery (10.11.2026).
      "Acord galerie online;Publicat online;În galerie acum;Câștigător vot public",
  );
  // 21:30 UTC is already 23:30 in Bucharest in November, same day.
  assert.equal(
    lines[1],
    `${entry.code};Palatul Copiilor;"Copil; Test";7;6-9;Părinte Export;0700 000 098;Da;Prenume și vârstă;Da;Da;inregistrat;Web;05.11.2026;05.11.2026;Nu;;Nu;Nu`,
  );

  // The columns the staff list is allowed to show: nothing personal about
  // the parent. The page builds its rows from exactly these keys.
  const listRow = {
    code: entry.code,
    childFirstName: entry.childFirstName,
    childAge: entry.childAge,
    category: entry.category,
    status: entry.status,
    createdAt: entry.createdAt,
    consentReproduction: entry.consentReproduction,
    consentPhoto: entry.consentPhoto,
    circleOptIn: entry.circleOptIn,
  };
  assert.ok(!("phone" in listRow));
  assert.ok(!("parentName" in listRow));
  assert.ok(!JSON.stringify(listRow).includes("0700000098"));
});

test("deleteDrawingEntries wipes the campaign and redacts its audit rows", async () => {
  const created = await db.createDrawingEntry({ ...baseInput });
  const { entry } = created;
  const row = await db.recordAudit({
    staffId: "staff-manager-rogerius",
    staffName: "Cont comun manager",
    locationSlug: "rogerius",
    action: "desene.status",
    target: entry.id,
    summary: `A marcat desenul ${entry.code} ca depus.`,
    details: { from: "inregistrat", to: "depus" },
  });
  const unrelated = await db.recordAudit({
    staffId: null,
    staffName: "Cont comun manager",
    locationSlug: "era",
    action: "program.salvat",
    target: "program",
    summary: "Program modificat.",
  });

  const before = (await db.listDrawingEntries()).length;
  assert.ok(before > 0);
  const result = await db.deleteDrawingEntries();
  assert.equal(result.deleted, before);
  assert.equal((await db.listDrawingEntries()).length, 0);
  assert.equal(await db.getDrawingEntry(entry.id), null);
  assert.equal(await db.findDrawingEntryByCode(entry.code), null);

  const audit = await db.listAudit({ limit: 500 });
  const redacted = audit.find((e) => e.id === row.id);
  assert.ok(redacted, "the row survives");
  assert.equal(redacted.target, "desen-sters");
  assert.equal(redacted.action, "desene.status");
  assert.ok(!redacted.summary.includes(entry.code));
  assert.equal(redacted.details, undefined);
  const kept = audit.find((e) => e.id === unrelated.id);
  assert.equal(kept.summary, "Program modificat.");

  // Sequences restart: the next edition begins at 001 again.
  const fresh = await db.createDrawingEntry({ ...baseInput });
  assert.equal(fresh.entry.code, "R-001");
});

test("the rate limiter allows `limit` calls per window, then refuses", () => {
  const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
  const t0 = new Date("2026-11-01T10:00:00.000Z");
  assert.equal(limiter.allow("ip-a", t0), true);
  assert.equal(limiter.allow("ip-a", t0), true);
  assert.equal(limiter.allow("ip-a", t0), true);
  assert.equal(limiter.allow("ip-a", t0), false);
  assert.equal(limiter.allow("ip-b", t0), true, "keys are independent");
  const later = new Date(t0.getTime() + 60_000);
  assert.equal(limiter.allow("ip-a", later), true, "window reset");
});
