"use server";

import { getDb } from "@/lib/db";
import { preregistrationRefusal } from "@/lib/campaign-guards";
import { campaignMoment, rateLimitAllow, recordServerEvent, requestAddress } from "@/lib/campaign-server";
import { parseDrawingForm, type DrawingSignupState } from "@/lib/drawing-form";

/**
 * Public preregistration for the drawing contest. No member, no card:
 * the parent gets a code and a sentence about what to do with it.
 *
 * Server functions are reachable by direct POST, so everything is checked
 * again here: the calendar first (`not_open` before 16.11, `closed` after
 * 01.12), then the form (lib/drawing-form.ts), then the address limit,
 * shared by every instance: a parent registers two or three children, a
 * script registers hundreds.
 */

/** Ten preregistrations per address per hour. */
const LIMIT = { limit: 10, windowMs: 60 * 60_000 };

export async function registerDrawingAction(
  _prev: DrawingSignupState,
  formData: FormData,
): Promise<DrawingSignupState> {
  const { phase } = await campaignMoment();
  const refused = preregistrationRefusal(phase);
  if (refused) return { ok: false, error: refused };

  const parsed = parseDrawingForm(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  // Counted only on a well-formed submit: typos must not eat the budget.
  if (!(await rateLimitAllow(`desen-ip:${await requestAddress()}`, LIMIT))) {
    return { ok: false, error: "rate" };
  }

  const { channel, ...values } = parsed.values;
  const result = await getDb().createDrawingEntry({ ...values, registeredVia: "web" });
  if (result.status !== "created") return { ok: false, error: "failed" };

  const { entry } = result;
  // Where it came from and which bucket: never who.
  await recordServerEvent("prereg_complete", {
    location: entry.location,
    category: entry.category,
    ...(channel ? { channel } : {}),
  });

  return {
    ok: true,
    code: entry.code,
    location: entry.location,
    childFirstName: entry.childFirstName,
    childAge: entry.childAge,
    category: entry.category,
    eligible: entry.consentReproduction,
  };
}
