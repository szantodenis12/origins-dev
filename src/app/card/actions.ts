"use server";

import { redirect } from "next/navigation";
import { ageOn, PARENTAL_CONSENT_AGE, type BirthDate } from "@/lib/age";
import { CONSENT_VERSION, getDb } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import type { Lang } from "@/lib/types";

/**
 * Signup for the Origins Circle card (faza 2.5). Server functions are
 * reachable by direct POST, so everything the form promises is re-checked
 * here — the client-side `required` attributes are convenience only.
 */

export type SignupError =
  | "name"
  | "phone"
  | "phone_exists"
  | "birthday"
  | "parental"
  | "consent";

export interface SignupState {
  error: SignupError | null;
}

/** Longest name the card and the admin list can show without breaking. */
const MAX_NAME = 60;

/** Full birthdate, mandatory (client decision 26.07): age check. */
function parseBirthday(
  dayRaw: string,
  monthRaw: string,
  yearRaw: string,
  now: Date,
): BirthDate | "invalid" {
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  if (![day, month, year].every(Number.isInteger)) return "invalid";
  if (month < 1 || month > 12 || day < 1 || day > 31) return "invalid";
  if (year < 1900 || year > now.getFullYear()) return "invalid";
  // Reject 31.04, 30.02, and 29.02 outside leap years.
  const date = new Date(year, month - 1, day);
  if (date.getDate() !== day || date.getMonth() !== month - 1) {
    return "invalid";
  }
  // A date still to come this year would give a negative age, which the
  // under-16 rule would then read as "needs a parent" instead of "wrong date".
  if (date.getTime() > now.getTime()) return "invalid";
  return { day, month, year };
}

export async function signupAction(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 3 || name.length > MAX_NAME) return { error: "name" };

  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (!phone) return { error: "phone" };

  if (formData.get("consent") !== "on") return { error: "consent" };

  const now = new Date();
  const birthday = parseBirthday(
    String(formData.get("birthDay") ?? ""),
    String(formData.get("birthMonth") ?? ""),
    String(formData.get("birthYear") ?? ""),
    now,
  );
  if (birthday === "invalid") return { error: "birthday" };

  // GDPR art. 8 (spec §3): under 16, a parent or guardian must agree. The
  // box only exists for under-16 members — the age decides, not the member.
  const needsParent = ageOn(birthday, now) < PARENTAL_CONSENT_AGE;
  if (needsParent && formData.get("parental") !== "on") {
    return { error: "parental" };
  }

  const langRaw = String(formData.get("lang") ?? "ro");
  const lang: Lang = langRaw === "hu" || langRaw === "en" ? langRaw : "ro";

  const result = await getDb().createMember({
    name,
    phone,
    birthDay: birthday.day,
    birthMonth: birthday.month,
    birthYear: birthday.year,
    lang,
    isStudent: formData.get("student") === "on",
    marketingConsent: formData.get("marketingConsent") === "on",
    consentVersion: CONSENT_VERSION,
  });

  // Spec §6.4: no SMS resend — the barista opens the existing card in admin.
  if (result.status === "phone_exists") return { error: "phone_exists" };
  if (result.status === "invalid_phone") return { error: "phone" };

  redirect(`/card/${result.member.id}`);
}
