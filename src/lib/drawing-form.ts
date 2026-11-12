import { normalizePhone } from "./phone.ts";
import { drawingCategory, isDrawingLocation } from "./drawing.ts";
import type { DrawingLocation } from "./drawing.ts";
import { sanitizeEventProps } from "./campaign-metrics.ts";

/**
 * The drawing registration form, parsed once for both doors: the public
 * /desen page and the counter screen /admin/desene/nou post the same field
 * names. Plain module, no "use server": the two server functions call it
 * and then decide `registeredVia` and the audit themselves.
 *
 * The client `required` attributes are convenience only — everything the
 * form promises is re-checked here.
 */

export type DrawingFormError =
  | "parent"
  | "phone"
  | "child"
  | "age"
  | "location"
  | "consent"
  | "rate"
  | "failed"
  /** Before 16.11.2026 00:00: preregistration has not started. */
  | "not_open"
  /** After 01.12.2026: drawings are no longer accepted. */
  | "closed";

export interface DrawingFormValues {
  location: DrawingLocation;
  parentName: string;
  phone: string;
  childFirstName: string;
  childAge: number;
  consentParticipation: true;
  consentReproduction: boolean;
  attribution: "first-name-age" | "none";
  consentPhoto: boolean;
  consentGallery: boolean;
  circleOptIn: boolean;
  /**
   * Acquisition channel from the hidden `ch` field (the page fills it from
   * `?ch=` / utm_source). A short slug or null: anything that could carry a
   * name or a phone is dropped (lib/campaign-metrics.ts). Measurement only,
   * never stored on the entry.
   */
  channel: string | null;
}

export type DrawingFormParse =
  | { ok: true; values: DrawingFormValues }
  | { ok: false; error: DrawingFormError };

/** What the forms get back; shared by both server functions. */
export type DrawingSignupState =
  | { ok: false; error: DrawingFormError | null }
  | {
      ok: true;
      code: string;
      location: DrawingLocation;
      childFirstName: string;
      childAge: number;
      category: string;
      /** False = exhibited only (no reproduction consent). */
      eligible: boolean;
    };

const on = (form: FormData, key: string) => form.get(key) === "on";

export function parseDrawingForm(form: FormData): DrawingFormParse {
  const parentName = String(form.get("parentName") ?? "").trim();
  if (parentName.length < 3 || parentName.length > 60) {
    return { ok: false, error: "parent" };
  }

  const phone = normalizePhone(String(form.get("phone") ?? ""));
  if (!phone) return { ok: false, error: "phone" };

  const childFirstName = String(form.get("childFirstName") ?? "").trim();
  if (childFirstName.length < 2 || childFirstName.length > 40) {
    return { ok: false, error: "child" };
  }

  const ageRaw = String(form.get("childAge") ?? "").trim();
  const childAge = /^\d{1,2}$/.test(ageRaw) ? Number(ageRaw) : NaN;
  if (!drawingCategory(childAge)) return { ok: false, error: "age" };

  const location = String(form.get("location") ?? "");
  if (!isDrawingLocation(location)) return { ok: false, error: "location" };

  if (!on(form, "consentParticipation")) return { ok: false, error: "consent" };

  const consentReproduction = on(form, "consentReproduction");
  const consentGallery = on(form, "consentGallery");
  return {
    ok: true,
    values: {
      location,
      parentName,
      phone,
      childFirstName,
      childAge,
      consentParticipation: true,
      consentReproduction,
      // The name is a separate opt-in, unticked by default: no box = no name.
      // It only means something where the name could appear: on printed
      // materials or in the online gallery.
      attribution:
        (consentReproduction || consentGallery) && on(form, "attributionName")
          ? "first-name-age"
          : "none",
      consentPhoto: on(form, "consentPhoto"),
      consentGallery,
      circleOptIn: on(form, "circleOptIn"),
      channel: sanitizeEventProps({ channel: String(form.get("ch") ?? "") }).channel ?? null,
    },
  };
}
