"use server";

import { createHmac, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import {
  accessMayTouch,
  readDrawingAccess,
  recordDrawingAudit,
  type DrawingAccess,
} from "@/lib/admin/drawing-access";
import { confirmTokenMatches } from "@/lib/admin/confirm-token";
import {
  contestLocation,
  DRAWING_RETENTION_END,
  isDrawingStatus,
} from "@/lib/drawing";
import { parseDrawingForm, type DrawingSignupState } from "@/lib/drawing-form";
import { getDrawingFileStore } from "@/lib/storage/drawings";
import {
  cafeSubmissionRefusal,
  collectionRefusal,
  juryPickRefusal,
  publishRefusal,
  publishResultsRefusal,
  reserveRefusal,
  selectionRefusal,
  SHEET_KIND_PHRASE,
  type PhaseRefusal,
} from "@/lib/campaign-guards";
import { campaignMoment, recordServerEvent } from "@/lib/campaign-server";
import { isSheetKind, type SheetKind } from "@/lib/db/campaign-rules";
import { bucharestInstant } from "@/lib/drawing-vote";

/**
 * Staff side of the drawing contest. Server functions are reachable by
 * direct POST, so each one re-reads the cookie and re-checks the role
 * instead of trusting the screen it came from.
 *
 * Every status change, counter registration, export and deletion lands in
 * the Jurnal. Summaries carry the drawing CODE and the cafenea, never the
 * child's name, the parent's name or the phone number.
 */

/** Staff screen: Romanian only. */
const strings = {
  noSession: "Sesiunea a expirat. Intră din nou în tură.",
  notManager: "Doar managerul poate face asta.",
  missing: "Desenul nu mai există. Reîncarcă pagina.",
  badStatus: "Stare necunoscută. Reîncarcă pagina.",
  badTransition: "Trecerea asta nu e permisă din starea curentă.",
  notEligible:
    "Fără acordul de reproducere desenul rămâne doar expus. Nu poate fi selectat.",
  statusSaved: (code: string, status: string) => `${code}: ${STATUS_LABEL[status] ?? status}.`,
  deleted: (count: number) =>
    `Datele concursului au fost șterse (${inscrieri(count)}). Jurnalul păstrează doar acțiunile, fără coduri.`,
  nothingToDelete: "Nu există înscrieri de șters.",
  otherLocation: "Desenul e înscris la altă cafenea.",
  published: (code: string) => `${code}: desenul e online, în galerie.`,
  unpublished: (code: string) =>
    `${code}: desenul a fost retras din galerie. Voturile primite se păstrează.`,
  publishBlocked: {
    no_consent: "Părintele nu a dat acordul pentru galeria online. Desenul nu se publică.",
    no_image: "Încarcă întâi fotografia desenului.",
    bad_status: "Se publică doar un desen depus sau expus. Marchează-l întâi ca depus.",
  },
  winnerSaved: (code: string, category: string) =>
    `${code}: câștigător la votul public, categoria ${category} ani.`,
  winnerReplaced: (code: string, category: string, old: string) =>
    `${code}: câștigător la votul public, categoria ${category} ani. A înlocuit desenul ${old}.`,
  winnerRemoved: (code: string) => `${code}: nu mai e marcat câștigător la votul public.`,
  winnerNotLive: "Desenul nu e online, deci nu poate câștiga votul public.",
  winnerNotEligible:
    "Fără acordul de reproducere desenul nu poate ajunge pe pahar. Alege următorul din clasament.",
  winnerIsJury:
    "Desenul e deja ales de juriu. Câștigătorii votului se stabilesc primii; juriul alege din restul.",
  voteWinnerNotJury:
    "Desenul a câștigat votul public. Juriul alege din celelalte desene.",
  phase: {
    submit: {
      not_open: "Depunerile încep pe 16.11.2026. Până atunci nu se înscrie și nu se primește niciun desen.",
      closed: "Depunerile s-au încheiat pe 01.12.2026. Desenul se poate expune, dar nu mai intră în concurs.",
    },
    publish: {
      not_open: "Galeria se deschide pe 16.11.2026.",
      closed: "Votul s-a încheiat pe 03.12.2026, la 23:59. Nu se mai publică desene noi.",
    },
    selection: {
      not_open: "Selecția începe după închiderea votului (03.12.2026, ora 23:59).",
      closed: "Ridicarea paharelor a început. Selecția nu se mai schimbă de aici.",
    },
    results: {
      not_open: "Rezultatele se pot publica de pe 06.12.2026, după închiderea votului.",
      closed: "Rezultatele sunt deja publice.",
    },
    collection: {
      not_open: "Ridicarea se deschide după ce rezultatele sunt publice.",
      closed: "Ridicarea e deschisă deja.",
    },
  } satisfies Record<string, Record<PhaseRefusal, string>>,
  badSheet: "Alege pe ce e desenat: foaia oficială, foaia de colorat sau altă foaie.",
  submitted: (code: string, sheet: string) => `${code}: primit în cafenea, pe ${sheet}.`,
  sheetCorrected: (code: string, sheet: string) => `${code}: corectat, desenul e pe ${sheet}.`,
  submitNotAllowed: "Desenul a fost deja selectat sau returnat. Nu se mai poate marca drept primit.",
  sheetWinner:
    "Desenul e câștigător sau rezervă. Pe altă foaie nu mai poate fi: scoate întâi marcajul din Selecție.",
  selectInSelection: "Alegerile juriului se fac din ecranul Selecție.",
  jury: {
    saved: (code: string) => `${code}: ales de juriu.`,
    removed: (code: string) => `${code}: nu mai e ales de juriu. Starea „Selectat” rămâne în registru.`,
    not_submitted: "Desenul nu a fost primit în cafenea. Juriul alege doar desene depuse.",
    not_eligible:
      "Desenul nu poate ajunge pe pahar: lipsește acordul de reproducere sau e pe altă foaie.",
    returned: "Desenul a fost returnat.",
    is_vote_winner: "Desenul a câștigat votul public. Juriul alege din celelalte desene.",
    vote_first:
      "Întâi se marchează câștigătorul votului public din grupa asta. Juriul alege după.",
    full: "Sunt deja 10 desene alese. Scoate unul înainte să alegi altul.",
  },
  reserve: {
    saved: (code: string, rank: number) => `${code}: rezerva ${rank} în grupa lui.`,
    removed: (code: string) => `${code}: nu mai e rezervă.`,
    invalid_rank: "Rangul de rezervă e un număr întreg, de la 1 în sus.",
    rank_taken: "Altă rezervă din aceeași grupă are deja acest rang.",
    not_submitted: "Desenul nu a fost primit în cafenea.",
    not_eligible: "Desenul nu poate ajunge pe pahar, deci nu poate fi rezervă.",
    returned: "Desenul a fost returnat.",
    is_winner: "Desenul e deja câștigător. Rezerva e alt desen.",
  },
  accepted: {
    saved: (code: string, when: string) => `${code}: acceptare notată (${when}).`,
    removed: (code: string) => `${code}: acceptarea a fost ștearsă.`,
    badDate: "Data nu e corectă. Exemplu: 05.12.2026, ora 18:30.",
    notWinner: "Acceptarea se notează doar pentru un desen câștigător.",
  },
  resultsPublished: (count: number) =>
    `Rezultatele sunt publice: ${count === 1 ? "1 desen acceptat" : `${count} desene acceptate`}.`,
  collectionOpen: "Ridicarea paharelor e deschisă. Site-ul o anunță de acum.",
  confirmDelete: (count: number, early: boolean) =>
    `Confirmi? Se șterg definitiv ${inscrieri(count)}, cu numele părinților, telefoanele, fotografiile desenelor și voturile. Galeria online rămâne goală. Fără recuperare.${
      early
        ? ` Perioada de păstrare a campaniei se încheie pe 31.01.2027; ștergerea de acum e mai devreme.`
        : ""
    }`,
};

const STATUS_LABEL: Record<string, string> = {
  inregistrat: "înregistrat",
  depus: "marcat ca depus",
  expus: "marcat ca expus",
  selectat: "selectat pentru print",
  returnat: "marcat ca returnat",
};

/** "1 înscriere", "5 înscrieri", "20 de înscrieri". */
function inscrieri(count: number): string {
  if (count === 1) return "1 înscriere";
  const rest = count % 100;
  return rest >= 1 && rest <= 19 ? `${count} înscrieri` : `${count} de înscrieri`;
}

export type DrawingAdminState =
  | { ok: true; text: string }
  | { ok: false; text: string; confirmToken?: string }
  | null;

/**
 * The session of whichever panel this request comes from: the Origins admin
 * on the main host, or the campaign's own panel on the campaign host
 * (lib/admin/drawing-access.ts). Every function below goes through here.
 */
async function staffSession(): Promise<{ session: DrawingAccess } | { error: string }> {
  const session = await readDrawingAccess();
  if (!session) return { error: strings.noSession };
  return { session };
}

function revalidate(): void {
  revalidatePath("/admin/desene", "layout");
  revalidatePath("/campanie-admin", "layout");
}

/* --------------------------------------------------------------- status --- */

export async function setDrawingStatusAction(
  _prev: DrawingAdminState,
  formData: FormData,
): Promise<DrawingAdminState> {
  const auth = await staffSession();
  if ("error" in auth) return { ok: false, text: auth.error };

  const id = String(formData.get("entryId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!isDrawingStatus(status)) return { ok: false, text: strings.badStatus };

  // A jury pick is a selection decision (winnerKind), made on the
  // selection screen in its phase, never a bare status step.
  if (status === "selectat") return { ok: false, text: strings.selectInSelection };
  if (status === "depus") {
    const refused = cafeSubmissionRefusal((await campaignMoment()).phase);
    if (refused) return { ok: false, text: strings.phase.submit[refused] };
  }

  // The adapter applies the ladder and the role; the screen only hides
  // buttons, a direct POST gets the same answer.
  const result = await getDb().setDrawingStatus(id, status, auth.session.role);
  if (result.status === "not_found") return { ok: false, text: strings.missing };
  if (result.status === "invalid_transition") return { ok: false, text: strings.badTransition };
  if (result.status === "not_eligible") {
    return { ok: false, text: strings.notEligible };
  }

  const { entry } = result;
  await recordDrawingAudit(auth.session, {
    action: "desene.status",
    target: entry.id,
    summary: `A marcat desenul ${entry.code} ca ${status} (${contestLocation(entry.location).name}).`,
    details: { code: entry.code, from: result.from, to: status },
  });

  revalidate();
  return { ok: true, text: strings.statusSaved(entry.code, status) };
}

/* -------------------------------------------------------------- gallery --- */

const mayTouch = accessMayTouch;

function revalidateGallery(): void {
  revalidate();
  revalidatePath("/desene", "layout");
}

/** "Publică în galerie": the photo is already uploaded (see [id]/imagine). */
export async function publishDrawingAction(
  _prev: DrawingAdminState,
  formData: FormData,
): Promise<DrawingAdminState> {
  const auth = await staffSession();
  if ("error" in auth) return { ok: false, text: auth.error };

  const refused = publishRefusal((await campaignMoment()).phase);
  if (refused) return { ok: false, text: strings.phase.publish[refused] };

  const db = getDb();
  const current = await db.getDrawingEntry(String(formData.get("entryId") ?? ""));
  if (!current) return { ok: false, text: strings.missing };
  if (!mayTouch(auth.session, current.location)) {
    return { ok: false, text: strings.otherLocation };
  }

  // The adapter holds the preconditions (consent, photo, depus/expus).
  const result = await db.publishDrawing(current.id);
  if (result.status === "not_found") return { ok: false, text: strings.missing };
  if (result.status === "blocked") {
    return { ok: false, text: strings.publishBlocked[result.reason] };
  }

  const { entry } = result;
  await recordDrawingAudit(auth.session, {
    action: "desene.publicare",
    target: entry.id,
    summary: `A publicat desenul ${entry.code} în galeria online (${contestLocation(entry.location).name}).`,
    details: { code: entry.code },
  });
  // Counted once per drawing: a take-down and return is not a new publication.
  if (current.publishedAt === null) {
    await recordServerEvent("publication", { location: entry.location, category: entry.category });
  }
  revalidateGallery();
  return { ok: true, text: strings.published(entry.code) };
}

/** Moderation: the drawing leaves the gallery, its votes stay. */
export async function unpublishDrawingAction(
  _prev: DrawingAdminState,
  formData: FormData,
): Promise<DrawingAdminState> {
  const auth = await staffSession();
  if ("error" in auth) return { ok: false, text: auth.error };

  const db = getDb();
  const current = await db.getDrawingEntry(String(formData.get("entryId") ?? ""));
  if (!current) return { ok: false, text: strings.missing };
  if (!mayTouch(auth.session, current.location)) {
    return { ok: false, text: strings.otherLocation };
  }

  const entry = await db.unpublishDrawing(current.id);
  if (!entry) return { ok: false, text: strings.missing };

  await recordDrawingAudit(auth.session, {
    action: "desene.retragere",
    target: entry.id,
    summary: `A retras desenul ${entry.code} din galeria online (${contestLocation(entry.location).name}).`,
    details: { code: entry.code },
  });
  revalidateGallery();
  return { ok: true, text: strings.unpublished(entry.code) };
}

/** Manager: "Marchează câștigător vot public", one per age group. */
export async function setVoteWinnerAction(
  _prev: DrawingAdminState,
  formData: FormData,
): Promise<DrawingAdminState> {
  const auth = await staffSession();
  if ("error" in auth) return { ok: false, text: auth.error };
  if (auth.session.role !== "manager") {
    return { ok: false, text: strings.notManager };
  }

  const refused = selectionRefusal((await campaignMoment()).phase);
  if (refused) return { ok: false, text: strings.phase.selection[refused] };

  const winner = formData.get("castigator") === "1";
  const result = await getDb().setDrawingVoteWinner(
    String(formData.get("entryId") ?? ""),
    winner,
  );
  if (result.status === "not_found") return { ok: false, text: strings.missing };
  if (result.status === "not_live") return { ok: false, text: strings.winnerNotLive };
  if (result.status === "not_eligible") {
    return { ok: false, text: strings.winnerNotEligible };
  }
  if (result.status === "is_jury_pick") return { ok: false, text: strings.winnerIsJury };

  const { entry, replaced } = result;
  // The Jurnal says who decided, never by how many votes.
  await recordDrawingAudit(auth.session, {
    action: "desene.vot-castigator",
    target: entry.id,
    summary: winner
      ? `A marcat desenul ${entry.code} câștigător la votul public (${entry.category} ani).`
      : `A scos marcajul de câștigător la votul public de pe desenul ${entry.code}.`,
    details: { code: entry.code, category: entry.category, winner, replaced: replaced?.code ?? null },
  });
  revalidate();
  if (!winner) return { ok: true, text: strings.winnerRemoved(entry.code) };
  return {
    ok: true,
    text: replaced
      ? strings.winnerReplaced(entry.code, entry.category, replaced.code)
      : strings.winnerSaved(entry.code, entry.category),
  };
}

/* -------------------------------------------------------------- counter --- */

/**
 * Same form as /desen, posted by staff with the parent in the café. When
 * the form carries `sheetKind` (the counter screens always send it: the
 * drawing is in the café), the entry is recorded as handed in at once.
 */
export async function registerCounterDrawingAction(
  _prev: DrawingSignupState,
  formData: FormData,
): Promise<DrawingSignupState> {
  const session = await readDrawingAccess();
  if (!session) return { ok: false, error: "failed" };

  const refused = cafeSubmissionRefusal((await campaignMoment()).phase);
  if (refused) return { ok: false, error: refused };

  const parsed = parseDrawingForm(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const rawSheet = formData.get("sheetKind");
  const sheetKind = isSheetKind(rawSheet) ? rawSheet : null;

  const db = getDb();
  // The campaign panel logs in with a shared PIN: there is no person to attribute to.
  const staff = session.platform ? await db.getStaffForSession(session.platform) : null;
  // A walk-in has no acquisition channel: the café is where it came from.
  const { channel, ...values } = parsed.values;
  void channel;
  const result = await db.createDrawingEntry({
    ...values,
    registeredVia: "counter",
    ...(staff ? { registeredBy: staff.id } : {}),
  });
  if (result.status !== "created") return { ok: false, error: "failed" };

  let { entry } = result;
  await recordDrawingAudit(session, {
    action: "desene.inscriere",
    target: entry.id,
    summary: `A înscris desenul ${entry.code} în cafenea (${contestLocation(entry.location).name}).`,
    details: { code: entry.code, category: entry.category },
  });

  if (sheetKind) {
    const marked = await db.markDrawingSubmitted(entry.id, {
      sheetKind,
      staffId: staff?.id ?? null,
    });
    if (marked.status === "saved") {
      entry = marked.entry;
      await recordDrawingAudit(session, {
        action: "desene.depunere",
        target: entry.id,
        summary: `A primit desenul ${entry.code} în cafenea, pe ${SHEET_LABEL[sheetKind]} (${contestLocation(entry.location).name}).`,
        details: { code: entry.code, sheetKind },
      });
      await recordServerEvent("physical_submission", {
        location: entry.location,
        category: entry.category,
      });
    }
  }

  revalidate();
  return {
    ok: true,
    code: entry.code,
    location: entry.location,
    childFirstName: entry.childFirstName,
    childAge: entry.childAge,
    category: entry.category,
    // Printable: reproduction consent and an official sheet.
    eligible: entry.consentReproduction && entry.sheetKind !== "alta-foaie",
  };
}

/* ---------------------------------------------------- physical submission --- */

/** What the sheet is, in words staff use (lib/campaign-guards.ts). */
const SHEET_LABEL: Record<SheetKind, string> = SHEET_KIND_PHRASE;

/**
 * "Primit în cafenea": a preregistered code arrives with the sheet and the
 * signed form. Moves "înregistrat" to "depus" and records the sheet kind;
 * on a drawing already handed in it only corrects the sheet kind.
 */
export async function markDrawingSubmittedAction(
  _prev: DrawingAdminState,
  formData: FormData,
): Promise<DrawingAdminState> {
  const auth = await staffSession();
  if ("error" in auth) return { ok: false, text: auth.error };

  const refused = cafeSubmissionRefusal((await campaignMoment()).phase);
  if (refused) return { ok: false, text: strings.phase.submit[refused] };

  const sheetKind = formData.get("sheetKind");
  if (!isSheetKind(sheetKind)) return { ok: false, text: strings.badSheet };

  const db = getDb();
  const current = await db.getDrawingEntry(String(formData.get("entryId") ?? ""));
  if (!current) return { ok: false, text: strings.missing };
  if (!mayTouch(auth.session, current.location)) {
    return { ok: false, text: strings.otherLocation };
  }

  const staff = auth.session.platform
    ? await db.getStaffForSession(auth.session.platform)
    : null;
  const result = await db.markDrawingSubmitted(current.id, {
    sheetKind,
    staffId: staff?.id ?? null,
  });
  if (result.status === "not_found") return { ok: false, text: strings.missing };
  if (result.status === "invalid_sheet_kind") return { ok: false, text: strings.badSheet };
  if (result.status === "invalid_transition") return { ok: false, text: strings.submitNotAllowed };
  if (result.status === "not_eligible") return { ok: false, text: strings.sheetWinner };

  const { entry } = result;
  const first = current.submittedAt === null && current.status === "inregistrat";
  await recordDrawingAudit(auth.session, {
    action: "desene.depunere",
    target: entry.id,
    summary: first
      ? `A primit desenul ${entry.code} în cafenea, pe ${SHEET_LABEL[sheetKind]} (${contestLocation(entry.location).name}).`
      : `A corectat foaia desenului ${entry.code}: ${SHEET_LABEL[sheetKind]}.`,
    details: { code: entry.code, sheetKind, from: result.from },
  });
  if (first) {
    await recordServerEvent("physical_submission", {
      location: entry.location,
      category: entry.category,
    });
  }
  revalidateGallery();
  return {
    ok: true,
    text: first
      ? strings.submitted(entry.code, SHEET_LABEL[sheetKind])
      : strings.sheetCorrected(entry.code, SHEET_LABEL[sheetKind]),
  };
}

/* -------------------------------------------------------------- selection --- */

async function managerInSelection(): Promise<{ session: DrawingAccess } | { error: string }> {
  const auth = await staffSession();
  if ("error" in auth) return auth;
  if (auth.session.role !== "manager") return { error: strings.notManager };
  const refused = selectionRefusal((await campaignMoment()).phase);
  if (refused) return { error: strings.phase.selection[refused] };
  return auth;
}

/**
 * Manager: "Ales de juriu" (juriu=1) or undo (juriu=0). The vote winners of
 * the category come first (lib/campaign-guards.ts `juryPickRefusal`). A
 * jury pick also walks the print ladder to "selectat", so the registers and
 * the export read the same thing; undoing it clears the pick, the ladder
 * has no way back from "selectat".
 */
export async function setJuryWinnerAction(
  _prev: DrawingAdminState,
  formData: FormData,
): Promise<DrawingAdminState> {
  const auth = await managerInSelection();
  if ("error" in auth) return { ok: false, text: auth.error };

  const db = getDb();
  const id = String(formData.get("entryId") ?? "");
  const current = await db.getDrawingEntry(id);
  if (!current) return { ok: false, text: strings.missing };
  const pick = formData.get("juriu") === "1";

  if (!pick) {
    if (current.winnerKind !== "jury") return { ok: true, text: strings.jury.removed(current.code) };
    const cleared = await db.setDrawingWinner(id, null);
    if (cleared.status !== "saved") return { ok: false, text: strings.missing };
    await recordDrawingAudit(auth.session, {
      action: "desene.juriu",
      target: id,
      summary: `A scos desenul ${current.code} dintre alegerile juriului (${current.category} ani).`,
      details: { code: current.code, category: current.category, pick: false },
    });
    revalidateGallery();
    return { ok: true, text: strings.jury.removed(current.code) };
  }

  const refused = juryPickRefusal(current, await db.listDrawingEntries());
  if (refused) return { ok: false, text: strings.jury[refused] };

  const result = await db.setDrawingWinner(id, "jury");
  if (result.status === "not_found") return { ok: false, text: strings.missing };
  if (result.status === "not_eligible") return { ok: false, text: strings.jury.not_eligible };
  if (result.status === "is_vote_winner") return { ok: false, text: strings.jury.is_vote_winner };
  if (result.status !== "saved") return { ok: false, text: strings.badTransition };

  // The print ladder follows: depus -> expus -> selectat.
  if (result.entry.status === "depus") await db.setDrawingStatus(id, "expus", "manager");
  const latest = await db.getDrawingEntry(id);
  if (latest?.status === "expus") await db.setDrawingStatus(id, "selectat", "manager");

  await recordDrawingAudit(auth.session, {
    action: "desene.juriu",
    target: id,
    summary: `A marcat desenul ${current.code} ales de juriu (${current.category} ani).`,
    details: { code: current.code, category: current.category, pick: true },
  });
  revalidateGallery();
  return { ok: true, text: strings.jury.saved(current.code) };
}

/** Manager: reserve rank in the drawing's category ("" clears it). */
export async function setReserveRankAction(
  _prev: DrawingAdminState,
  formData: FormData,
): Promise<DrawingAdminState> {
  const auth = await managerInSelection();
  if ("error" in auth) return { ok: false, text: auth.error };

  const db = getDb();
  const id = String(formData.get("entryId") ?? "");
  const current = await db.getDrawingEntry(id);
  if (!current) return { ok: false, text: strings.missing };

  const raw = String(formData.get("rang") ?? "").trim();
  const rank = raw === "" ? null : /^\d{1,2}$/.test(raw) ? Number(raw) : NaN;
  if (rank !== null) {
    if (!Number.isInteger(rank) || rank < 1) return { ok: false, text: strings.reserve.invalid_rank };
    const refused = reserveRefusal(current);
    if (refused) return { ok: false, text: strings.reserve[refused] };
  }

  const result = await db.setReserveRank(id, rank);
  if (result.status === "not_found") return { ok: false, text: strings.missing };
  if (result.status !== "saved") return { ok: false, text: strings.reserve[result.status] };

  await recordDrawingAudit(auth.session, {
    action: "desene.rezerva",
    target: id,
    summary:
      rank === null
        ? `A scos desenul ${current.code} dintre rezerve.`
        : `A marcat desenul ${current.code} rezerva ${rank} (${current.category} ani).`,
    details: { code: current.code, category: current.category, rank },
  });
  revalidate();
  return {
    ok: true,
    text: rank === null ? strings.reserve.removed(current.code) : strings.reserve.saved(current.code, rank),
  };
}

/** "05.12.2026 18:30" / "2026-12-05T18:30" (Bucharest) -> instant; null when not a date. */
function parseBucharestDateTime(raw: string): Date | null {
  const value = raw.trim();
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/);
  const ro = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,?\s*(?:ora\s*)?(\d{1,2}):(\d{2}))?$/);
  const parts = iso
    ? [iso[1], iso[2], iso[3], iso[4] ?? "12", iso[5] ?? "00"]
    : ro
      ? [ro[3], ro[2], ro[1], ro[4] ?? "12", ro[5] ?? "00"]
      : null;
  if (!parts) return null;
  const [y, mo, d, h, mi] = parts.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const at = bucharestInstant(y, mo, d, h, mi);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Manager: the parent accepted after the private call (art. 10.2). The
 * date is the one on the signed form; empty = now. "anulare=1" clears it.
 * Only accepted winners are ever announced.
 */
export async function setWinnerAcceptedAction(
  _prev: DrawingAdminState,
  formData: FormData,
): Promise<DrawingAdminState> {
  const auth = await managerInSelection();
  if ("error" in auth) return { ok: false, text: auth.error };

  const db = getDb();
  const id = String(formData.get("entryId") ?? "");
  const undo = formData.get("anulare") === "1";
  const raw = String(formData.get("data") ?? "");
  const { now } = await campaignMoment();
  const at = undo ? null : raw.trim() === "" ? now : parseBucharestDateTime(raw);
  if (!undo && !at) return { ok: false, text: strings.accepted.badDate };

  const result = await db.setWinnerAccepted(id, at);
  if (result.status === "not_found") return { ok: false, text: strings.missing };
  if (result.status === "not_winner") return { ok: false, text: strings.accepted.notWinner };

  const { entry } = result;
  const when = at
    ? new Intl.DateTimeFormat("ro-RO", {
        timeZone: "Europe/Bucharest",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(at)
    : "";
  await recordDrawingAudit(auth.session, {
    action: "desene.acceptare",
    target: entry.id,
    summary: at
      ? `A notat acceptarea premiului pentru desenul ${entry.code} (${when}).`
      : `A șters acceptarea premiului pentru desenul ${entry.code}.`,
    details: { code: entry.code, acceptedAt: entry.winnerAcceptedAt },
  });
  revalidateGallery();
  return {
    ok: true,
    text: at ? strings.accepted.saved(entry.code, when) : strings.accepted.removed(entry.code),
  };
}

/** Manager, from 06.12: the accepted winners become public. */
export async function publishResultsAction(): Promise<DrawingAdminState> {
  const auth = await staffSession();
  if ("error" in auth) return { ok: false, text: auth.error };
  if (auth.session.role !== "manager") return { ok: false, text: strings.notManager };

  const { now, phase } = await campaignMoment();
  const refused = publishResultsRefusal(now, phase);
  if (refused) return { ok: false, text: strings.phase.results[refused] };

  const db = getDb();
  await db.updateCampaignState({ resultsPublishedAt: now.toISOString() });
  const accepted = (await db.listDrawingEntries()).filter(
    (entry) => entry.winnerKind !== null && entry.winnerAcceptedAt !== null,
  ).length;
  await recordDrawingAudit(auth.session, {
    action: "desene.rezultate",
    target: "desene",
    summary: `A publicat rezultatele concursului (${accepted} desene acceptate).`,
  });
  revalidateGallery();
  return { ok: true, text: strings.resultsPublished(accepted) };
}

/** Manager, only once the cups are physically in the cafés. */
export async function confirmCollectionAction(): Promise<DrawingAdminState> {
  const auth = await staffSession();
  if ("error" in auth) return { ok: false, text: auth.error };
  if (auth.session.role !== "manager") return { ok: false, text: strings.notManager };

  const { now, phase } = await campaignMoment();
  const refused = collectionRefusal(phase);
  if (refused) return { ok: false, text: strings.phase.collection[refused] };

  await getDb().updateCampaignState({ collectionConfirmedAt: now.toISOString() });
  await recordDrawingAudit(auth.session, {
    action: "desene.ridicare",
    target: "desene",
    summary: "A confirmat că paharele au ajuns în cafenele și a deschis ridicarea.",
  });
  revalidateGallery();
  return { ok: true, text: strings.collectionOpen };
}

/* ------------------------------------------------- end-of-campaign delete --- */

/**
 * Same secret the staff cookie is signed with (see setari/actions.ts for
 * why it is reused). The token folds the entry COUNT in, so an entry
 * registered between the two presses asks again instead of deleting
 * something the manager never saw counted.
 */
const DEV_SECRET = Symbol.for("origins.desene-confirm-secret.v1");

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

function deleteToken(count: number): string {
  return createHmac("sha256", confirmSecret())
    .update(`desene.stergere:${count}`)
    .digest("base64url")
    .slice(0, 22);
}

export async function deleteDrawingDataAction(
  _prev: DrawingAdminState,
  formData: FormData,
): Promise<DrawingAdminState> {
  const auth = await staffSession();
  if ("error" in auth) return { ok: false, text: auth.error };
  if (auth.session.role !== "manager") {
    return { ok: false, text: strings.notManager };
  }

  const db = getDb();
  const count = (await db.listDrawingEntries()).length;
  if (count === 0) return { ok: false, text: strings.nothingToDelete };

  const token = deleteToken(count);
  if (!confirmTokenMatches(String(formData.get("confirmare") ?? ""), token)) {
    const early = new Date().toISOString().slice(0, 10) <= DRAWING_RETENTION_END;
    return { ok: false, text: strings.confirmDelete(count, early), confirmToken: token };
  }

  // The photos go with the rows: originals, gallery versions, cup mockups.
  const files = (await db.listDrawingEntries()).flatMap((entry) => [
    entry.imageOriginal,
    entry.imageWeb,
    entry.cupMockup,
  ]);
  const { deleted } = await db.deleteDrawingEntries();
  await getDrawingFileStore().remove(files);

  // Nothing identifying survives, the Jurnal included: only the count.
  await recordDrawingAudit(auth.session, {
    action: "desene.stergere",
    target: "desene",
    summary: `A șters datele concursului de desene (${inscrieri(deleted)}).`,
  });

  revalidate();
  return { ok: true, text: strings.deleted(deleted) };
}
