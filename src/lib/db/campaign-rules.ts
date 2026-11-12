import { normalizePhone } from "../phone.ts";
import {
  drawingCategory,
  isDrawingLocation,
  type DrawingAttribution,
  type DrawingCategory,
  type DrawingLocation,
} from "../drawing.ts";

/**
 * Adapter-level rules of the campaign store, shared by the memory adapter
 * (memory.ts) and the Supabase adapter (supabase.ts) so both answer the
 * same thing. Pure, no I/O. The SQL in migration 0004 holds the same rules
 * again as check constraints: the database is the backstop, not the source.
 */

/**
 * What the child drew on, recorded when the sheet is physically handed in.
 *   oficiala    the official contest sheet
 *   colorat     the official colouring sheet
 *   alta-foaie  any other paper: exhibited (and online, with consent),
 *               never selectable for print, never a cup winner or reserve
 */
export type SheetKind = "oficiala" | "colorat" | "alta-foaie";
export const SHEET_KINDS: readonly SheetKind[] = ["oficiala", "colorat", "alta-foaie"];

export function isSheetKind(value: unknown): value is SheetKind {
  return typeof value === "string" && (SHEET_KINDS as readonly string[]).includes(value);
}

/** How a drawing won its cup: the public vote, or the jury. */
export type WinnerKind = "vote" | "jury";
export const WINNER_KINDS: readonly WinnerKind[] = ["vote", "jury"];

export function isWinnerKind(value: unknown): value is WinnerKind {
  return typeof value === "string" && (WINNER_KINDS as readonly string[]).includes(value);
}

/**
 * Printable = may go on a cup: reproduction consent AND not drawn on other
 * paper. Stricter than lib/drawing.ts `drawingEligibleForPrint` (consent
 * only), which predates the sheet kind; a null sheet kind (not handed in
 * yet, or recorded through the old `setDrawingStatus("depus")`) counts as
 * printable, as before.
 */
export function campaignPrintable(entry: {
  consentReproduction: boolean;
  sheetKind?: SheetKind | null;
}): boolean {
  return entry.consentReproduction && entry.sheetKind !== "alta-foaie";
}

export interface ValidDrawingEntryValues {
  location: DrawingLocation;
  childFirstName: string;
  childAge: number;
  category: DrawingCategory;
  parentName: string;
  phone: string;
  consentReproduction: boolean;
  attribution: DrawingAttribution;
  consentPhoto: boolean;
  consentGallery: boolean;
  circleOptIn: boolean;
}

export type DrawingEntryValidation =
  | { ok: true; values: ValidDrawingEntryValues }
  | {
      ok: false;
      status:
        | "invalid_name"
        | "invalid_phone"
        | "invalid_age"
        | "unknown_location"
        | "consent_required";
    };

/** Same checks, same order, as the memory adapter always did. */
export function validateNewDrawingEntry(input: {
  location: string;
  childFirstName: string;
  childAge: number;
  parentName: string;
  phone: string;
  consentParticipation: boolean;
  consentReproduction: boolean;
  attribution: DrawingAttribution;
  consentPhoto: boolean;
  consentGallery?: boolean;
  circleOptIn: boolean;
}): DrawingEntryValidation {
  if (!input.consentParticipation) return { ok: false, status: "consent_required" };
  if (!isDrawingLocation(input.location)) return { ok: false, status: "unknown_location" };
  const childFirstName = input.childFirstName.trim();
  const parentName = input.parentName.trim();
  if (
    childFirstName.length < 2 ||
    childFirstName.length > 40 ||
    parentName.length < 3 ||
    parentName.length > 60
  ) {
    return { ok: false, status: "invalid_name" };
  }
  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, status: "invalid_phone" };
  const category = drawingCategory(input.childAge);
  if (!category) return { ok: false, status: "invalid_age" };
  const consentGallery = input.consentGallery ?? false;
  return {
    ok: true,
    values: {
      location: input.location,
      childFirstName,
      childAge: input.childAge,
      category,
      parentName,
      phone,
      consentReproduction: input.consentReproduction,
      // The first name shows on printed materials and in the online
      // gallery; without either consent there is nothing to attribute.
      attribution:
        input.consentReproduction || consentGallery ? input.attribution : "none",
      consentPhoto: input.consentPhoto,
      consentGallery,
      circleOptIn: input.circleOptIn,
    },
  };
}

/** Statuses from which a sheet can be recorded as handed in (or corrected). */
export const SUBMITTABLE_STATUSES = ["inregistrat", "depus", "expus"] as const;
