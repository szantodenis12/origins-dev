import {
  TIMEZONE,
  // Explicit .ts extensions: tests import this module under plain Node,
  // whose type stripping resolves relative paths literally.
} from "./loyalty.ts";
import { formatPhone } from "./phone.ts";

/**
 * CSV export of the member list. The client owns their customer data — that
 * was a selling point against the previous provider — and this file is the
 * way it leaves the platform, including for a GDPR access request.
 *
 * Pure on purpose: rows in, one string out, tested under `node --test`. The
 * server route only gathers the rows and hands the result to the browser.
 */

/** One member, already resolved: the route computes stamps and Gold. */
export interface MemberExportRow {
  name: string;
  /** Canonical national format ("0740038569") — see lib/phone.ts. */
  phone: string;
  birthDay: number | null;
  birthMonth: number | null;
  birthYear: number | null;
  lang: string;
  isStudent: boolean;
  studentVerifiedAt: string | null;
  consentVersion: string | null;
  consentAt: string | null;
  marketingConsentAt: string | null;
  totalStamps: number;
  goldNow: boolean;
  blockedAt: string | null;
  createdAt: string;
}

/** Romanian Excel splits on ";" by default — the decimal separator is ",". */
const SEPARATOR = ";";

/**
 * UTF-8 byte order mark. Without it, Excel on Windows opens the file as ANSI
 * and every ă/â/î/ș/ț in names and headers comes out mangled.
 */
const BOM = "\uFEFF";

const HEADER = [
  "Nume",
  "Telefon",
  "Data nașterii",
  "Limbă",
  "Elev/student",
  "Legitimație validată",
  "Versiune consimțământ",
  "Data consimțământului",
  "Consimțământ promoțional",
  "Total ștampile",
  "Gold acum",
  "Card blocat",
  "Data înscrierii",
];

/**
 * RFC 4180 quoting, with ";" as our separator: a field that carries the
 * separator, a quote or a line break is wrapped in quotes, and embedded
 * quotes are doubled. Everything else passes through untouched.
 */
function csvField(value: string): string {
  if (!/[";\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

const dateParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** ISO timestamp -> "07.08.2026" on the Bucharest calendar; "" for null. */
function bucharestDate(at: string | null): string {
  if (at === null) return "";
  const parts = dateParts.formatToParts(new Date(at));
  const find = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${find("day")}.${find("month")}.${find("year")}`;
}

/** The stored day/month/year, plainly — no timezone to get wrong. */
function birthDate(row: MemberExportRow): string {
  if (row.birthDay === null || row.birthMonth === null || row.birthYear === null) {
    return "";
  }
  const dd = String(row.birthDay).padStart(2, "0");
  const mm = String(row.birthMonth).padStart(2, "0");
  return `${dd}.${mm}.${row.birthYear}`;
}

function yesNo(value: boolean): string {
  return value ? "Da" : "Nu";
}

/**
 * The whole file, BOM included. CRLF line endings because the primary reader
 * is Excel on Windows; every other tool accepts them too.
 */
export function memberExportCsv(rows: MemberExportRow[]): string {
  return csvFile([
    HEADER,
    ...rows.map((row) => [
      row.name,
      // Grouped ("0740 038 569"): the space keeps Excel from reading the
      // number as a number and eating the leading zero.
      formatPhone(row.phone),
      birthDate(row),
      row.lang.toUpperCase(),
      yesNo(row.isStudent),
      yesNo(row.studentVerifiedAt !== null),
      row.consentVersion ?? "",
      bucharestDate(row.consentAt),
      yesNo(row.marketingConsentAt !== null),
      String(row.totalStamps),
      yesNo(row.goldNow),
      yesNo(row.blockedAt !== null),
      bucharestDate(row.createdAt),
    ]),
  ]);
}

function csvFile(lines: string[][]): string {
  return (
    BOM +
    lines.map((line) => line.map(csvField).join(SEPARATOR)).join("\r\n") +
    "\r\n"
  );
}

/* ---------------------------------------------- desene (concurs 2026) --- */

/**
 * One drawing entry, as stored. This export is the ONLY place the parent's
 * name and phone leave the platform: the staff list never shows them, the
 * manager downloads this file to call the selected families.
 */
export interface DrawingExportRow {
  code: string;
  locationName: string;
  childFirstName: string;
  childAge: number;
  category: string;
  parentName: string;
  /** Canonical national format ("0740038569") — see lib/phone.ts. */
  phone: string;
  consentReproduction: boolean;
  attribution: "first-name-age" | "none";
  consentPhoto: boolean;
  circleOptIn: boolean;
  status: string;
  registeredVia: "web" | "counter";
  createdAt: string;
  updatedAt: string;
  /** Gallery columns; absent on rows built before the gallery existed. */
  consentGallery?: boolean;
  publishedAt?: string | null;
  online?: boolean;
  voteWinner?: boolean;
}

const DRAWING_HEADER = [
  "Cod",
  "Locație",
  "Prenume copil",
  "Vârstă",
  "Categorie",
  "Părinte",
  "Telefon",
  "Acord reproducere",
  "Atribuire",
  "Acord foto/video",
  "Info Origins Circle",
  "Stare",
  "Înscris prin",
  "Data înscrierii",
  "Ultima modificare",
  "Acord galerie online",
  "Publicat online",
  "În galerie acum",
  "Câștigător vot public",
];

const ATTRIBUTION_LABEL = {
  "first-name-age": "Prenume și vârstă",
  none: "Fără prenume",
};

const VIA_LABEL = { web: "Web", counter: "Tejghea" };

export function drawingExportCsv(rows: DrawingExportRow[]): string {
  return csvFile([
    DRAWING_HEADER,
    ...rows.map((row) => [
      row.code,
      row.locationName,
      row.childFirstName,
      String(row.childAge),
      row.category,
      row.parentName,
      formatPhone(row.phone),
      yesNo(row.consentReproduction),
      ATTRIBUTION_LABEL[row.attribution],
      yesNo(row.consentPhoto),
      yesNo(row.circleOptIn),
      row.status,
      VIA_LABEL[row.registeredVia],
      bucharestDate(row.createdAt),
      bucharestDate(row.updatedAt),
      yesNo(row.consentGallery ?? false),
      bucharestDate(row.publishedAt ?? null),
      yesNo(row.online ?? false),
      yesNo(row.voteWinner ?? false),
    ]),
  ]);
}

/* ------------------------------------------------- voturi (concurs 2026) --- */

/**
 * One vote. `emailHash` is the keyed hash from lib/vote-hash.ts: the file
 * can show that two votes came from the same mailbox, never which mailbox.
 */
export interface VoteExportRow {
  code: string;
  category: string;
  emailHash: string;
  createdAt: string;
}

const voteTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  hourCycle: "h23",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** "17.11.2026 18:04:09", Bucharest time. */
function bucharestDateTime(at: string): string {
  const parts = voteTime.formatToParts(new Date(at));
  const find = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${find("day")}.${find("month")}.${find("year")} ${find("hour")}:${find("minute")}:${find("second")}`;
}

export function voteExportCsv(rows: VoteExportRow[]): string {
  return csvFile([
    ["Cod desen", "Categorie", "Amprentă e-mail", "Momentul votului"],
    ...rows.map((row) => [
      row.code,
      row.category,
      row.emailHash,
      bucharestDateTime(row.createdAt),
    ]),
  ]);
}
