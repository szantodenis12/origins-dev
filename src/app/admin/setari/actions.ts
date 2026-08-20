"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { recordAdminAudit } from "@/lib/admin/audit";
import {
  confirmTokenMatches,
  programConfirmToken,
} from "@/lib/admin/confirm-token";
import { readStaffSession } from "@/lib/admin/session";
import {
  configChanges,
  configChangeSummary,
  configImpact,
  impactIsHarmful,
  impactSentence,
  type ConfigImpact,
  type MemberSnapshot,
} from "@/lib/config-impact";
import {
  PERK_IDS,
  sanitizeLoyaltyConfig,
  type LoyaltyConfig,
  type RewardId,
} from "@/lib/program";
import { PERK_ROTATIONS } from "./shared";

/**
 * The program editor. This is where Origins changes the mechanics without a
 * deploy, so it is also where a bad value would quietly change what every
 * customer is owed: the form is parsed field by field, the result goes
 * through `sanitizeLoyaltyConfig`, and the public pages are revalidated so
 * the site never advertises the previous deal.
 *
 * Every edit is retroactive — the card is derived, so lengthening it moves
 * every member backwards the moment it saves. The save therefore walks the
 * real members first (lib/config-impact.ts): a change that takes something
 * away does not save on the first press, it comes back as a confirmation
 * that states the damage, and saves only when the same form is pressed
 * again. The decision is made HERE on every press, never in the client.
 */

/** Staff screen: Romanian only. */
const strings = {
  noSession: "Sesiunea a expirat. Intră din nou în tură.",
  notManager: "Doar managerul poate schimba programul de fidelitate.",
  saved: "Program salvat. Cardurile și regulamentul s-au actualizat.",
  // Only after a save that really changed something: the members' accepted
  // consent stays on the old version until the rules text is re-versioned.
  savedConsentReminder:
    "Program salvat. Cardurile și regulamentul s-au actualizat. Dacă schimbarea e una importantă, actualizează și versiunea regulamentului: membrii au acceptat varianta de dinainte.",
  badCycle: "Cardul are între 1 și 30 de ștampile.",
  badGoldCycle: "Cardul Gold are între 1 și 30 de ștampile.",
  badMid: "Recompensa intermediară trebuie să vină înaintea ultimei ștampile.",
  badWindow: "Ora de final trebuie să fie după ora de început.",
  badPerks: "Alege ce primesc membrii Gold în fiecare perioadă.",
  badCap: "Plafonul recompenselor e o sumă în lei. Lasă gol pentru fără plafon.",
};

/**
 * Same shape as the meniu SaveState, plus the confirmation branch: the text
 * states the impact and `confirmToken` must come back with the second press.
 */
export type ProgramSaveState =
  | { ok: true; text: string }
  | { ok: false; text: string; confirmToken?: string }
  | null;

/**
 * Same secret the staff cookie is signed with: in production it must be set,
 * in development a stable per-process value is enough. Reusing it keeps the
 * number of secrets to configure at one. The token itself is built in
 * `lib/admin/confirm-token.ts`, which explains why it is keyed.
 */
function confirmSecret(): string {
  const configured = process.env.ADMIN_SESSION_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ADMIN_SESSION_SECRET trebuie setat în producție (minimum 32 de caractere).",
    );
  }
  const host = globalThis as typeof globalThis & { [DEV_SECRET]?: string };
  host[DEV_SECRET] ??= randomBytes(32).toString("base64url");
  return host[DEV_SECRET];
}

const DEV_SECRET = Symbol.for("origins.program-confirm-secret.v1");

function confirmTokenFor(patch: LoyaltyConfig, impact: ConfigImpact): string {
  return programConfirmToken(
    { ...patch, updatedAt: null },
    impact,
    confirmSecret(),
  );
}

async function memberSnapshots(): Promise<MemberSnapshot[]> {
  const db = getDb();
  const members = await db.listMembers();
  return Promise.all(
    members.map(async (member) => ({
      stamps: await db.getMemberStamps(member.id),
      redemptions: await db.getMemberRedemptions(member.id),
      birth: {
        day: member.birthDay,
        month: member.birthMonth,
        year: member.birthYear,
      },
    })),
  );
}

/**
 * The cap field is the one number that may be legitimately EMPTY: empty means
 * "no cap", so it cannot go through `num()` and its fallback.
 */
function capValue(form: FormData): number | null | "invalid" {
  const raw = String(form.get("rewardValueCap") ?? "").trim();
  if (raw === "") return null;
  const value = Number(raw.replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return "invalid";
  return value;
}

function num(form: FormData, key: string, fallback: number): number {
  const raw = String(form.get(key) ?? "").trim();
  if (raw === "") return fallback;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : fallback;
}

function on(form: FormData, key: string): boolean {
  return form.get(key) !== null;
}

function text(form: FormData, key: string, fallback: string): string {
  const raw = String(form.get(key) ?? "").trim();
  return raw === "" ? fallback : raw;
}

function names(
  form: FormData,
  current: LoyaltyConfig["names"],
): LoyaltyConfig["names"] {
  const ids: RewardId[] = ["upgrade", "free_coffee", ...PERK_IDS, "birthday_drink"];
  const out = { ...current };
  for (const id of ids) {
    out[id] = {
      ro: text(form, `name.${id}.ro`, current[id].ro),
      hu: text(form, `name.${id}.hu`, current[id].hu),
      en: text(form, `name.${id}.en`, current[id].en),
    };
  }
  return out;
}

export async function saveProgramAction(
  _prev: ProgramSaveState,
  form: FormData,
): Promise<ProgramSaveState> {
  const session = await readStaffSession();
  if (!session) return { ok: false, text: strings.noSession };
  if (session.role !== "manager") {
    return { ok: false, text: strings.notManager };
  }

  const db = getDb();
  const current = await db.getLoyaltyConfig();

  const cycleLength = num(form, "cycleLength", current.cycleLength);
  const goldCycleLength = num(form, "gold.cycleLength", current.gold.cycleLength);
  const midEnabled = on(form, "midReward.enabled");
  const midAt = num(form, "midReward.stampsRequired", current.midReward.stampsRequired);
  const fromHour = num(form, "doubleStamp.fromHour", current.doubleStamp.fromHour);
  const toHour = num(form, "doubleStamp.toHour", current.doubleStamp.toHour);
  const rotation = PERK_ROTATIONS[String(form.get("gold.perks.rotation") ?? "")];
  const rewardValueCap = capValue(form);

  // Refuse rather than silently clamp: a manager who typed 40 stamps meant
  // something, and the sanitizer's fallback would hide the mistake.
  if (!Number.isInteger(cycleLength) || cycleLength < 1 || cycleLength > 30) {
    return { ok: false, text: strings.badCycle };
  }
  if (
    !Number.isInteger(goldCycleLength) ||
    goldCycleLength < 1 ||
    goldCycleLength > 30
  ) {
    return { ok: false, text: strings.badGoldCycle };
  }
  if (midEnabled && (!Number.isInteger(midAt) || midAt < 1 || midAt >= cycleLength)) {
    return { ok: false, text: strings.badMid };
  }
  if (toHour <= fromHour) return { ok: false, text: strings.badWindow };
  if (!rotation) return { ok: false, text: strings.badPerks };
  if (rewardValueCap === "invalid") return { ok: false, text: strings.badCap };

  const patch = sanitizeLoyaltyConfig({
    cycleLength,
    midReward: { enabled: midEnabled, stampsRequired: midAt },
    gold: {
      enabled: on(form, "gold.enabled"),
      cardsRequired: num(form, "gold.cardsRequired", current.gold.cardsRequired),
      requalifyCards: num(
        form,
        "gold.requalifyCards",
        current.gold.requalifyCards,
      ),
      inactivityDays: num(
        form,
        "gold.inactivityDays",
        current.gold.inactivityDays,
      ),
      warningDays: num(form, "gold.warningDays", current.gold.warningDays),
      cycleLength: goldCycleLength,
      perks: {
        enabled: on(form, "gold.perks.enabled"),
        periodDays: num(form, "gold.perks.periodDays", current.gold.perks.periodDays),
        clock:
          String(form.get("gold.perks.clock") ?? "") === "personal"
            ? "personal"
            : "shared",
        anchorDate: text(
          form,
          "gold.perks.anchorDate",
          current.gold.perks.anchorDate,
        ),
        rotation,
        toGoOnly: on(form, "gold.perks.toGoOnly"),
      },
    },
    doubleStamp: {
      enabled: on(form, "doubleStamp.enabled"),
      weekday: num(form, "doubleStamp.weekday", current.doubleStamp.weekday),
      fromHour,
      toHour,
    },
    birthday: {
      enabled: on(form, "birthday.enabled"),
      windowDays: num(form, "birthday.windowDays", current.birthday.windowDays),
    },
    stampWindowHours: num(form, "stampWindowHours", current.stampWindowHours),
    rewardValueCap,
    names: names(form, current.names),
  });

  // The impact check: resolve every real member's card under the current and
  // the incoming config. Anything worse for anyone stops the first press.
  const impact = configImpact(
    await memberSnapshots(),
    current,
    patch,
    new Date(),
  );
  if (impactIsHarmful(impact)) {
    const token = confirmTokenFor(patch, impact);
    if (!confirmTokenMatches(String(form.get("confirmare") ?? ""), token)) {
      return { ok: false, text: impactSentence(impact), confirmToken: token };
    }
  }

  await db.updateLoyaltyConfig(patch);

  // The Jurnal row lists exactly which fields moved, old value to new.
  const changes = configChanges(current, patch);
  await recordAdminAudit(session, {
    action: "program.salvat",
    target: "program",
    summary: configChangeSummary(changes),
    details: changes.length > 0 ? { changes } : null,
  });

  // Everything that states a number from the program.
  revalidatePath("/", "layout");

  return {
    ok: true,
    text: changes.length > 0 ? strings.savedConsentReminder : strings.saved,
  };
}
