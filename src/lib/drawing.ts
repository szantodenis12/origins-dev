/**
 * Concursul de desene „Crăciunul, desenat de cei mici. Ediția I, 2026”.
 *
 * Pure rules, no I/O: the public form, the counter form, the staff list and
 * the tests all read the same code format, the same age categories and the
 * same status ladder from here. The entries themselves live behind the `Db`
 * port (`DrawingEntry` in lib/db), separate from members and cards: a parent
 * who registers a drawing does not get a loyalty card and is never a member.
 */

export const CONTEST_NAME = "Crăciunul, desenat de cei mici. Ediția I, 2026";

/** Last day drawings are accepted at the counter (Bucharest calendar). */
export const DRAWING_DEADLINE_LABEL = "1 decembrie 2026";

/**
 * Calendar fixed by the client (10.11.2026). Day labels are Bucharest
 * calendar days; the two instants are the exact moments in UTC.
 *
 *   16.11 - 01.12  drawings accepted at the counter
 *   rolling        each drawing goes online within 24 h of being handed in
 *   until 03.12    public vote, open from the moment a drawing is online
 *   02 - 03.12     jury
 *   07.12          files to the cup supplier (proposal; lib/campaign-phase.ts
 *                  CAMPAIGN_DATES is the source of truth)
 *   06.12          announcement
 */
export const CONTEST_CALENDAR = {
  drawingsFrom: "2026-11-16",
  drawingsUntil: "2026-12-01",
  juryFrom: "2026-12-02",
  juryUntil: "2026-12-03",
  // Must equal CAMPAIGN_DATES.filesToSupplier in lib/campaign-phase.ts (the source of truth).
  filesToSupplier: "2026-12-07",
  announcement: "2026-12-06",
} as const;

/** How soon a handed-in drawing should be online. Staff target, not enforced. */
export const GALLERY_PUBLISH_WITHIN_HOURS = 24;

/**
 * The public vote closes on 03.12.2026 at 23:59 Europe/Bucharest: the last
 * accepted vote is one cast during that minute, so the instant below is the
 * end of it (04.12 00:00 EET = 03.12 22:00 UTC). Tests check it against
 * the Bucharest wall clock (lib/drawing-vote.ts `bucharestInstant`).
 */
export const VOTE_CLOSES_AT = "2026-12-03T22:00:00.000Z";
export const VOTE_CLOSES_LABEL = "3 decembrie 2026, 23:59";

/** Ten cups: three by public vote (one per age group), seven by the jury. */
export const VOTE_WINNERS_PER_CATEGORY = 1;
export const JURY_PICKS_PER_CATEGORY = {
  "3-5": 2,
  "6-9": 3,
  "10-14": 2,
} as const;
export const CUP_WINNERS_TOTAL = 10;

/** After this date the manager deletes the campaign data (lib/db deleteDrawingEntries). */
export const DRAWING_RETENTION_END = "2027-01-31";

export type DrawingLocation = "rogerius" | "era" | "palatul-copiilor";

export interface ContestLocation {
  slug: DrawingLocation;
  /** The letter in front of the sequence: R-001, E-001, P-001. */
  code: "R" | "E" | "P";
  name: string;
  /**
   * Which café slugs from `lib/data.ts` sit at this contest location. The
   * seed still calls the Palatul Copiilor café `gara` (Roland, 18.09.2026:
   * the fourth café is Palatul Copiilor, the rename is pending), so a staff
   * phone logged in at `gara` preselects Palatul Copiilor here.
   */
  staffSlugs: string[];
}

export const CONTEST_LOCATIONS: ContestLocation[] = [
  { slug: "rogerius", code: "R", name: "Rogerius", staffSlugs: ["rogerius"] },
  { slug: "era", code: "E", name: "ERA Shopping Park", staffSlugs: ["era"] },
  {
    slug: "palatul-copiilor",
    code: "P",
    name: "Palatul Copiilor",
    staffSlugs: ["palatul-copiilor", "gara"],
  },
];

export function isDrawingLocation(value: string): value is DrawingLocation {
  return CONTEST_LOCATIONS.some((location) => location.slug === value);
}

export function contestLocation(slug: DrawingLocation): ContestLocation {
  return CONTEST_LOCATIONS.find((location) => location.slug === slug)!;
}

/** The contest location a staff phone sits at; null when the café is not in the contest. */
export function contestLocationForStaff(
  staffLocationSlug: string,
): DrawingLocation | null {
  return (
    CONTEST_LOCATIONS.find((location) =>
      location.staffSlugs.includes(staffLocationSlug),
    )?.slug ?? null
  );
}

/** "R-001": location letter, dash, three-digit zero-padded sequence. */
export function drawingCode(location: DrawingLocation, sequence: number): string {
  return `${contestLocation(location).code}-${String(sequence).padStart(3, "0")}`;
}

/** "r 12" / "R-12" / " r012 " -> "R-012"; null when it is not a code shape. */
export function normalizeDrawingCode(raw: string): string | null {
  const match = raw
    .trim()
    .toUpperCase()
    .match(/^([REP])\s*-?\s*(\d{1,3})$/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(3, "0")}`;
}

/* ---------------------------------------------------------------- ages --- */

export const MIN_AGE = 3;
export const MAX_AGE = 14;

export type DrawingCategory = "3-5" | "6-9" | "10-14";

export const DRAWING_CATEGORIES: DrawingCategory[] = ["3-5", "6-9", "10-14"];

/**
 * The age group is derived from the age, never typed: 3–5, 6–9, 10–14.
 * Anything outside, or not a whole number, is refused with null.
 */
export function drawingCategory(age: number): DrawingCategory | null {
  if (!Number.isInteger(age) || age < MIN_AGE || age > MAX_AGE) return null;
  if (age <= 5) return "3-5";
  if (age <= 9) return "6-9";
  return "10-14";
}

/* -------------------------------------------------------------- status --- */

export type DrawingStatus =
  | "inregistrat"
  | "depus"
  | "expus"
  | "selectat"
  | "returnat";

/** In the order a drawing moves through them. */
export const DRAWING_STATUSES: DrawingStatus[] = [
  "inregistrat",
  "depus",
  "expus",
  "selectat",
  "returnat",
];

export function isDrawingStatus(value: string): value is DrawingStatus {
  return DRAWING_STATUSES.includes(value as DrawingStatus);
}

/**
 * The ladder: registered -> handed in -> exhibited -> selected -> returned.
 * A drawing can be returned from any physical state, never from
 * "înregistrat" (there is nothing to hand back yet), and "returnat" is
 * final. Only a manager selects for print.
 */
export function canChangeDrawingStatus(
  from: DrawingStatus,
  to: DrawingStatus,
  role: "barista" | "manager",
): boolean {
  if (to === "selectat" && role !== "manager") return false;
  switch (from) {
    case "inregistrat":
      return to === "depus";
    case "depus":
      return to === "expus" || to === "returnat";
    case "expus":
      return to === "selectat" || to === "returnat";
    case "selectat":
      return to === "returnat";
    case "returnat":
      return false;
  }
}

export type DrawingAttribution = "first-name-age" | "none";

/**
 * Only a drawing whose parent agreed to reproduction can be selected for the
 * Origins cups and materials. Without it the drawing is exhibited
 * and that is all: a manager pressing "selectat" on it is refused.
 */
export function drawingEligibleForPrint(entry: {
  consentReproduction: boolean;
}): boolean {
  return entry.consentReproduction;
}

/* ------------------------------------------------------------- gallery --- */

/**
 * Online publishing has its own consent (`consentGallery`), separate from
 * reproduction on cups: a drawing can be in the gallery without being
 * printable, and the other way round. Staff publish a photo only once the
 * sheet is physically in the café.
 */
export type PublishBlock = "no_consent" | "no_image" | "bad_status";

export function drawingPublishBlock(entry: {
  consentGallery: boolean;
  status: DrawingStatus;
  imageWeb: string | null;
}): PublishBlock | null {
  if (!entry.consentGallery) return "no_consent";
  if (entry.status !== "depus" && entry.status !== "expus") return "bad_status";
  if (!entry.imageWeb) return "no_image";
  return null;
}

/** Online right now: published once and not taken down since. */
export function drawingIsLive(entry: {
  publishedAt: string | null;
  unpublishedAt: string | null;
}): boolean {
  return entry.publishedAt !== null && entry.unpublishedAt === null;
}

/**
 * Everything a public page may know about a drawing. Built field by field
 * on purpose: nothing about the parent, the phone, the café or the votes
 * can leak by spreading a stored row. `firstName` and `age` are present only
 * when the parent chose "prenume și vârstă"; otherwise the public sees the
 * code and the age group.
 */
export interface PublicDrawing {
  code: string;
  category: DrawingCategory;
  firstName: string | null;
  age: number | null;
  image: string;
  imageWidth: number;
  imageHeight: number;
  /**
   * Cup mockup image, generated at upload for drawings that may be printed.
   * Its presence is also what tells the public page to offer "Pe pahar".
   * Always null when the drawing is not printable (see `votable`).
   */
  cupImage: string | null;
  /**
   * The drawing can receive votes and win a cup: reproduction consent AND
   * drawn on an official sheet (regulament art. 6.4, 9^1.2). False = shown
   * in the gallery only, without a vote button. The server refuses a vote
   * for it anyway (`not_votable`). Says nothing about the calendar: whether
   * voting is open is the campaign phase's business.
   */
  votable: boolean;
}

/**
 * May go on a cup. The same rule as lib/db/campaign-rules.ts
 * `campaignPrintable`, written out here because that module imports this
 * one: reproduction consent, and not drawn on other paper. A null sheet
 * kind (not handed in yet) counts as printable.
 */
function printable(entry: {
  consentReproduction: boolean;
  sheetKind?: string | null;
}): boolean {
  return entry.consentReproduction && entry.sheetKind !== "alta-foaie";
}

export function publicDrawing(entry: {
  code: string;
  category: DrawingCategory;
  childFirstName: string;
  childAge: number;
  attribution: DrawingAttribution;
  imageWeb: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  cupMockup: string | null;
  consentReproduction: boolean;
  sheetKind?: string | null;
}): PublicDrawing | null {
  if (!entry.imageWeb) return null;
  const named = entry.attribution === "first-name-age";
  const votable = printable(entry);
  return {
    code: entry.code,
    category: entry.category,
    firstName: named ? entry.childFirstName : null,
    age: named ? entry.childAge : null,
    image: entry.imageWeb,
    imageWidth: entry.imageWidth ?? 4,
    imageHeight: entry.imageHeight ?? 3,
    cupImage: votable ? entry.cupMockup : null,
    votable,
  };
}
