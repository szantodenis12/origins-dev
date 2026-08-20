import assert from "node:assert/strict";
import test from "node:test";

// The member CSV export: pure module, rows in, one Excel-ready string out.
import { memberExportCsv } from "../src/lib/export.ts";

/** A complete, ordinary row; tests override what they probe. */
const baseRow = {
  name: "Ana Test",
  phone: "0740038569",
  birthDay: 29,
  birthMonth: 2,
  birthYear: 2004,
  lang: "ro",
  isStudent: true,
  studentVerifiedAt: "2026-07-01T10:00:00.000Z",
  consentVersion: "2026-08-04",
  consentAt: "2026-08-04T09:00:00.000Z",
  marketingConsentAt: "2026-08-04T09:00:00.000Z",
  totalStamps: 17,
  goldNow: true,
  blockedAt: null,
  createdAt: "2026-08-04T09:00:00.000Z",
};

function lines(csv) {
  return csv.split("\r\n");
}

test("starts with a UTF-8 BOM and the Romanian header, ; separated", () => {
  const csv = memberExportCsv([]);
  assert.equal(csv[0], "﻿", "BOM first, or Excel mangles diacritics");
  assert.equal(
    lines(csv)[0].slice(1),
    "Nume;Telefon;Data nașterii;Limbă;Elev/student;Legitimație validată;" +
      "Versiune consimțământ;Data consimțământului;Consimțământ promoțional;" +
      "Total ștampile;Gold acum;Card blocat;Data înscrierii",
  );
  // Header, then the closing newline: an empty export is still a valid file.
  assert.equal(lines(csv).length, 2);
  assert.equal(lines(csv)[1], "");
});

test("an ordinary row lands with dates in DD.MM.YYYY and Da/Nu flags", () => {
  const csv = memberExportCsv([baseRow]);
  assert.equal(
    lines(csv)[1],
    // Phone grouped so Excel keeps the leading zero; birthdate straight from
    // the stored numbers; ISO timestamps on the Bucharest calendar.
    "Ana Test;0740 038 569;29.02.2004;RO;Da;Da;2026-08-04;04.08.2026;Da;17;Da;Nu;04.08.2026",
  );
});

test("timestamps convert to the Bucharest calendar day, not UTC", () => {
  // 21:30 UTC in summer is 00:30 the NEXT day in Bucharest (UTC+3).
  const csv = memberExportCsv([
    { ...baseRow, createdAt: "2026-08-04T21:30:00.000Z" },
  ]);
  assert.ok(lines(csv)[1].endsWith(";05.08.2026"));
});

test("null birthdate, consent and marketing come out empty or Nu", () => {
  const csv = memberExportCsv([
    {
      ...baseRow,
      birthDay: null,
      birthMonth: null,
      birthYear: null,
      isStudent: false,
      studentVerifiedAt: null,
      consentVersion: null,
      consentAt: null,
      marketingConsentAt: null,
      totalStamps: 0,
      goldNow: false,
      blockedAt: "2026-08-01T10:00:00.000Z",
    },
  ]);
  assert.equal(
    lines(csv)[1],
    "Ana Test;0740 038 569;;RO;Nu;Nu;;;Nu;0;Nu;Da;04.08.2026",
  );
});

test("separators, quotes and newlines inside a field are quoted away", () => {
  const csv = memberExportCsv([
    { ...baseRow, name: 'Pop; zis "Anei"' },
    { ...baseRow, name: "Rând\nnou" },
  ]);
  const body = lines(csv);
  assert.ok(body[1].startsWith('"Pop; zis ""Anei""";0740 038 569;'));
  // The embedded newline stays inside its quotes (a bare LF, not our CRLF
  // record separator), so the record still parses back as one row.
  assert.ok(body[2].startsWith('"Rând\nnou";0740 038 569;'));
});
