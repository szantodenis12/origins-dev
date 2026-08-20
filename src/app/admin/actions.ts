"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import type { StaffSession } from "@/lib/db";
import {
  buildPanel,
  normalizeSerial,
  type PanelNotice,
  type PanelResult,
} from "@/lib/admin/panel";
import { recordAdminAudit } from "@/lib/admin/audit";
import {
  clearStaffSession,
  readStaffSession,
  roleForPin,
  staffLocations,
  writeStaffSession,
} from "@/lib/admin/session";
import { formatBucharestTime, type RewardId } from "@/lib/loyalty";
import { normalizePhone } from "@/lib/phone";

/**
 * Every mutation the barista screen can trigger. Server functions are
 * reachable by direct POST, so each one re-reads the cookie instead of
 * trusting the caller.
 */

const strings = {
  stampAdded: "Ștampilă adăugată.",
  stampAddedDouble: "Ștampilă dublă adăugată. Plus doi.",
  alreadyStamped: (time: string) =>
    `Are deja ștampilă aici. Următoarea de la ${time}.`,
  // "Recompensă" carries the agreement, so any reward name fits the sentence:
  // "{name}: predată" would be wrong the moment a name is masculine.
  redeemed: (reward: string) => `Recompensă predată: ${reward}.`,
  notEarned: "Recompensa nu mai este disponibilă. Cardul e actualizat mai jos.",
  reviewBonus: "Ștampila bonus pentru recenzie a fost adăugată.",
  reviewBonusUsed: "Bonusul de recenzie a fost deja folosit.",
  studentVerified:
    "Legitimația este validată. Cardul Student Circle este activ.",
  // A blocked card refuses everything; the panel already says since when.
  memberBlocked: "Cardul e blocat. Nu se adaugă ștampile și nu se predau recompense.",
  blocked: "Card blocat. QR-ul nu mai adună ștampile.",
  unblocked: "Card deblocat. Ștampilele merg mai departe.",
  reissued:
    "Cod QR nou emis. Cel vechi nu mai funcționează; cardul web al membrului s-a actualizat singur.",
  marketingWithdrawn:
    "Acord promoțional retras. Membrul nu mai primește mesaje promoționale, cardul merge mai departe.",
};

async function staffId(session: StaffSession): Promise<string | null> {
  const staff = await getDb().getStaffForSession(session);
  return staff?.id ?? null;
}

async function panelResult(
  memberId: string,
  session: StaffSession,
  notice?: PanelNotice,
): Promise<PanelResult> {
  const panel = await buildPanel(memberId, session.locationSlug);
  if (!panel) return { ok: false, reason: "not_found" };
  return notice ? { ok: true, panel, notice } : { ok: true, panel };
}

/* ----------------------------------------------------------------- auth --- */

export async function loginAction(formData: FormData): Promise<void> {
  const pin = String(formData.get("pin") ?? "").trim();
  const locationSlug = String(formData.get("locationSlug") ?? "");

  const known = (await staffLocations()).some((l) => l.slug === locationSlug);
  if (!known) redirect("/admin?eroare=locatie");

  // Shared PINs first (manager, generic barista), then personal codes —
  // a personal login attributes every stamp to that barista in statistici.
  const role = roleForPin(pin);
  if (role) {
    await writeStaffSession({ locationSlug, role });
    redirect("/admin/scan");
  }

  const staff = await getDb().findStaffByPin(locationSlug, pin);
  if (!staff) redirect("/admin?eroare=pin");

  await writeStaffSession({ locationSlug, role: staff.role, staffId: staff.id });
  redirect("/admin/scan");
}

export async function logoutAction(): Promise<void> {
  await clearStaffSession();
  redirect("/admin");
}

/* ----------------------------------------------------------------- scan --- */

export async function lookupMemberAction(raw: string): Promise<PanelResult> {
  const session = await readStaffSession();
  if (!session) return { ok: false, reason: "unauthorized" };

  const db = getDb();

  // Counter flow from the GDPR spec §6.4: a member who lost the card link is
  // found by phone number; anything else is treated as a pass serial.
  const phone = normalizePhone(raw);
  if (phone) {
    const member = await db.findMemberByPhone(phone);
    if (!member) return { ok: false, reason: "not_found" };
    return panelResult(member.id, session);
  }

  const serial = normalizeSerial(raw);
  if (!serial) return { ok: false, reason: "invalid" };

  const member = await db.findMemberByPassSerial(serial);
  if (!member) return { ok: false, reason: "not_found" };

  return panelResult(member.id, session);
}

export async function addStampAction(memberId: string): Promise<PanelResult> {
  const session = await readStaffSession();
  if (!session) return { ok: false, reason: "unauthorized" };

  const result = await getDb().addStamp({
    memberId,
    locationSlug: session.locationSlug,
    staffId: await staffId(session),
  });

  if (result.status === "not_found") return { ok: false, reason: "not_found" };

  if (result.status === "already_stamped") {
    // Not an error: the barista sees when the next stamp becomes possible.
    return panelResult(memberId, session, {
      tone: "info",
      text: strings.alreadyStamped(
        formatBucharestTime(result.nextAllowedAt),
      ),
    });
  }

  if (result.status === "bonus_used") {
    return panelResult(memberId, session, {
      tone: "info",
      text: strings.reviewBonusUsed,
    });
  }

  if (result.status === "blocked") {
    return panelResult(memberId, session, {
      tone: "info",
      text: strings.memberBlocked,
    });
  }

  return panelResult(memberId, session, {
    tone: "success",
    text:
      result.event.kind === "double_tuesday"
        ? strings.stampAddedDouble
        : strings.stampAdded,
  });
}

export async function redeemRewardAction(
  memberId: string,
  rewardId: RewardId,
): Promise<PanelResult> {
  const session = await readStaffSession();
  if (!session) return { ok: false, reason: "unauthorized" };

  const result = await getDb().redeemReward({
    memberId,
    rewardId,
    locationSlug: session.locationSlug,
    staffId: await staffId(session),
  });

  if (result.status === "not_found") return { ok: false, reason: "not_found" };

  if (result.status === "not_earned") {
    // Double tap or a panel left open while the card changed: "mai încearcă"
    // would be a lie. Send the fresh panel back so the button disappears.
    return panelResult(memberId, session, {
      tone: "info",
      text: strings.notEarned,
    });
  }

  if (result.status === "blocked") {
    return panelResult(memberId, session, {
      tone: "info",
      text: strings.memberBlocked,
    });
  }

  const config = await getDb().getLoyaltyConfig();
  return panelResult(memberId, session, {
    tone: "success",
    text: strings.redeemed(config.names[rewardId].ro),
  });
}

export async function reviewBonusAction(
  memberId: string,
): Promise<PanelResult> {
  const session = await readStaffSession();
  if (!session) return { ok: false, reason: "unauthorized" };

  const result = await getDb().addStamp({
    memberId,
    locationSlug: session.locationSlug,
    staffId: await staffId(session),
    kind: "review_bonus",
  });

  if (result.status === "not_found") return { ok: false, reason: "not_found" };

  if (result.status === "bonus_used") {
    return panelResult(memberId, session, {
      tone: "info",
      text: strings.reviewBonusUsed,
    });
  }

  if (result.status === "blocked") {
    return panelResult(memberId, session, {
      tone: "info",
      text: strings.memberBlocked,
    });
  }

  return panelResult(memberId, session, {
    tone: "success",
    text: strings.reviewBonus,
  });
}

export async function verifyStudentAction(
  memberId: string,
): Promise<PanelResult> {
  const session = await readStaffSession();
  if (!session) return { ok: false, reason: "unauthorized" };

  const member = await getDb().markStudentVerified(
    memberId,
    await staffId(session),
  );
  if (!member) return { ok: false, reason: "not_found" };

  return panelResult(memberId, session, {
    tone: "success",
    text: strings.studentVerified,
  });
}

/* --------------------------------------------- manager-only card control --- */

/**
 * The QR is the whole identity, so a screenshot of it collects stamps on
 * somebody else's account. These two are the countermeasures — manager only:
 * a barista at the counter must not be able to block a customer. Both land
 * in the Jurnal by name, never by phone number.
 */

export async function reissuePassSerialAction(
  memberId: string,
): Promise<PanelResult> {
  const session = await readStaffSession();
  if (!session || session.role !== "manager") {
    return { ok: false, reason: "unauthorized" };
  }

  const db = getDb();
  const member = await db.getMember(memberId);
  if (!member) return { ok: false, reason: "not_found" };

  const result = await db.reissuePassSerial(memberId);
  if (result.status !== "reissued") return { ok: false, reason: "not_found" };

  // No serial in the Jurnal, old or new: the serial is the credential.
  await recordAdminAudit(session, {
    action: "membru.cod-nou",
    target: memberId,
    summary: `A emis cod QR nou pentru ${member.name}.`,
  });

  return panelResult(memberId, session, {
    tone: "success",
    text: strings.reissued,
  });
}

export async function setMemberBlockedAction(
  memberId: string,
  blocked: boolean,
): Promise<PanelResult> {
  const session = await readStaffSession();
  if (!session || session.role !== "manager") {
    return { ok: false, reason: "unauthorized" };
  }

  const db = getDb();
  const result = await db.setMemberBlocked(memberId, blocked);
  if (result.status !== "saved") return { ok: false, reason: "not_found" };

  await recordAdminAudit(session, {
    action: blocked ? "membru.blocare" : "membru.deblocare",
    target: memberId,
    summary: blocked
      ? `A blocat cardul lui ${result.member.name}.`
      : `A deblocat cardul lui ${result.member.name}.`,
  });

  return panelResult(memberId, session, {
    tone: "success",
    text: blocked ? strings.blocked : strings.unblocked,
  });
}

/* --------------------------------------------------- manager-only GDPR --- */

export async function withdrawMarketingConsentAction(
  memberId: string,
): Promise<PanelResult> {
  const session = await readStaffSession();
  if (!session || session.role !== "manager") {
    return { ok: false, reason: "unauthorized" };
  }

  const result = await getDb().withdrawMarketingConsent(memberId);
  if (result.status !== "saved") return { ok: false, reason: "not_found" };

  await recordAdminAudit(session, {
    action: "membru.retragere-marketing",
    target: memberId,
    summary: `A retras acordul promoțional pentru ${result.member.name}.`,
  });

  return panelResult(memberId, session, {
    tone: "success",
    text: strings.marketingWithdrawn,
  });
}

/**
 * Erasure ends with no panel to show, so it does not return a PanelResult:
 * the scan screen goes back to the scanner with a short confirmation.
 */
export type ForgetMemberActionResult =
  | { ok: true }
  | { ok: false; reason: "unauthorized" | "not_found" };

export async function forgetMemberAction(
  memberId: string,
): Promise<ForgetMemberActionResult> {
  const session = await readStaffSession();
  if (!session || session.role !== "manager") {
    return { ok: false, reason: "unauthorized" };
  }

  const result = await getDb().forgetMember(memberId);
  if (result.status !== "forgotten") return { ok: false, reason: "not_found" };

  // The whole point of erasure is that nothing identifies the person after
  // it, the Jurnal included: no name, no id, only that it happened and who
  // pressed the button.
  await recordAdminAudit(session, {
    action: "membru.stergere",
    target: "membru",
    summary: "A șters definitiv un membru cu datele lui personale, la cerere (GDPR).",
  });

  return { ok: true };
}
