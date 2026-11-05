"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import type { StaffRole, StaffSession } from "@/lib/db";
import { recordAdminAudit } from "@/lib/admin/audit";
import { readStaffSession } from "@/lib/admin/session";

/**
 * Team mutations. Server functions are reachable by direct POST, so each one
 * re-reads the cookie and re-checks the manager role instead of trusting the
 * form it came from.
 *
 * Every mutation lands in the Jurnal (lib/admin/audit.ts) — the manager code
 * is shared, so the log is the only answer to "cine a dat cod nou". Summaries
 * carry names and cafenele only, never a code.
 */

export type TeamOp =
  | "redenumeste"
  | "cod"
  | "activ"
  | "inactiv"
  | "acces-adauga"
  | "acces-scoate";

/**
 * Same shape as the meniu SaveState, plus which operation produced it: the
 * row UI closes its inline rename only after a rename actually saved.
 */
export type TeamSaveState =
  | { ok: true; text: string; op: TeamOp | "adauga" }
  | { ok: false; text: string }
  | null;

/** Staff screen: Romanian only. */
const strings = {
  noSession: "Sesiunea a expirat. Intră din nou în tură.",
  notManager: "Doar managerul poate administra echipa.",
  nameMissing: "Scrie un nume de cel mult 60 de caractere.",
  badRole: "Alege rolul din listă.",
  locationMissing: "Cafeneaua nu mai există. Reîncarcă pagina.",
  personMissing: "Persoana nu mai există. Reîncarcă pagina.",
  badOp: "Acțiune necunoscută. Reîncarcă pagina.",
  renamed: "Nume salvat.",
  badPin: "Codul de acces trebuie să conțină exact 4 cifre (ex: 1234).",
  // Deliberately does not say whose code it collides with: that would hand
  // one person another person's code.
  pinTaken:
    "Codul e deja folosit la cafeneaua asta sau e rezervat. Alege altul.",
  // Mirrors the add-café wording: the code exists only in this notice.
  created: (pin: string, cafenea: string) =>
    `Persoană adăugată. Codul pentru ${cafenea} (se afișează o singură dată): ${pin}. Notează-l acum.`,
  newPin: (pin: string, cafenea: string) =>
    `Cod nou pentru ${cafenea} (se afișează o singură dată): ${pin}. Notează-l acum. Cel vechi nu mai funcționează.`,
  sharedAccount:
    "Contul comun folosește codul din setările serverului. Se schimbă de acolo, nu de aici.",
  deactivated:
    "Persoana nu mai poate intra în tură. Ștampilele din istoric rămân la numele ei.",
  reactivated: "Persoana poate intra din nou în tură.",
  ownAccount: "Nu poți dezactiva contul cu care ești în tură acum.",
  ownSharedAccount:
    "Ești în tură chiar pe contul comun. Intră cu un cod personal de manager, apoi oprește-l de acolo.",
  /* --- access at more than one cafenea --- */
  accessAdded: (pin: string, cafenea: string) =>
    `Poate intra în tură la ${cafenea}. Codul de acolo (se afișează o singură dată): ${pin}. Notează-l acum.`,
  accessExists:
    "Are deja cod la cafeneaua asta. Folosește Cod nou dacă vrei să-l schimbi.",
  accessMissing:
    "Nu are cod la cafeneaua asta. Dă-i întâi acces, de la Adaugă cafenea.",
  accessRemoved: (cafenea: string) =>
    `Nu mai poate intra în tură la ${cafenea}. Codurile de la celelalte cafenele rămân valabile.`,
  // Saying it out loud beats leaving a row that looks normal and never works.
  accessRemovedLast: (cafenea: string) =>
    `Nu mai poate intra în tură la ${cafenea} și nu mai are cod nicăieri. Dă-i acces la o cafenea ca să poată lucra.`,
};

function fail(text: string): TeamSaveState {
  return { ok: false, text };
}

async function managerSession(): Promise<
  { session: StaffSession } | { error: string }
> {
  const session = await readStaffSession();
  if (!session) return { error: strings.noSession };
  if (session.role !== "manager") return { error: strings.notManager };
  return { session };
}

/** Echipa and Statistici both show staff names and states. */
function revalidateTeam(): void {
  revalidatePath("/admin", "layout");
}

/** Jurnal summaries name cafenele, not slugs. */
async function locationName(slug: string): Promise<string> {
  return (await getDb().getLocationBySlug(slug))?.name ?? slug;
}

/** An empty field means "generate one"; anything else is the manager's. */
function typedPin(formData: FormData): string | undefined {
  const pin = String(formData.get("pin") ?? "").trim();
  return pin.length > 0 ? pin : undefined;
}

export async function createStaffAction(
  _prev: TeamSaveState,
  formData: FormData,
): Promise<TeamSaveState> {
  const auth = await managerSession();
  if ("error" in auth) return fail(auth.error);

  const rol = String(formData.get("rol") ?? "");
  if (rol !== "barista" && rol !== "manager") return fail(strings.badRole);

  const result = await getDb().createStaff({
    name: String(formData.get("nume") ?? ""),
    locationSlug: String(formData.get("cafenea") ?? ""),
    role: rol as StaffRole,
    pin: typedPin(formData),
  });

  if (result.status === "invalid_name") return fail(strings.nameMissing);
  if (result.status === "unknown_location") return fail(strings.locationMissing);
  if (result.status === "invalid_pin") return fail(strings.badPin);
  if (result.status === "pin_taken") return fail(strings.pinTaken);

  const cafenea = await locationName(result.staff.locationSlug);
  await recordAdminAudit(auth.session, {
    action: "echipa.adaugare",
    target: result.staff.id,
    summary: `A adăugat ${result.staff.name} (${rol}) la ${cafenea}.`,
  });

  revalidateTeam();
  return { ok: true, text: strings.created(result.pin, cafenea), op: "adauga" };
}

export async function updateStaffAction(
  _prev: TeamSaveState,
  formData: FormData,
): Promise<TeamSaveState> {
  const auth = await managerSession();
  if ("error" in auth) return fail(auth.error);

  const db = getDb();
  const id = String(formData.get("staffId") ?? "");
  const op = String(formData.get("op") ?? "");

  if (op === "redenumeste") {
    // The old name would be gone after the rename; the Jurnal keeps it.
    const before = (await db.listStaff()).find((s) => s.id === id)?.name;
    const result = await db.renameStaff(id, String(formData.get("nume") ?? ""));
    if (result.status === "not_found") return fail(strings.personMissing);
    if (result.status === "invalid_name") return fail(strings.nameMissing);
    await recordAdminAudit(auth.session, {
      action: "echipa.redenumire",
      target: id,
      summary: `A redenumit ${before ?? "?"} în ${result.staff.name}.`,
      details: { from: before ?? null, to: result.staff.name },
    });
    revalidateTeam();
    return { ok: true, text: strings.renamed, op };
  }

  // Codes are per cafenea, so every code operation carries the cafenea it is
  // about. Without it the call would quietly land on the home cafenea and
  // reset a code the manager never meant to touch.
  if (op === "cod") {
    const locationSlug = String(formData.get("cafenea") ?? "");
    if (!locationSlug) return fail(strings.locationMissing);

    const result = await db.setStaffPin(id, locationSlug, typedPin(formData));
    if (result.status === "not_found") return fail(strings.personMissing);
    if (result.status === "shared_account") return fail(strings.sharedAccount);
    if (result.status === "invalid_pin") return fail(strings.badPin);
    if (result.status === "pin_taken") return fail(strings.pinTaken);
    if (result.status === "no_access") return fail(strings.accessMissing);

    const cafenea = await locationName(result.locationSlug);
    // The code itself never touches the Jurnal — only that it changed.
    await recordAdminAudit(auth.session, {
      action: "echipa.cod-nou",
      target: id,
      summary: `A generat cod nou pentru ${result.staff.name} la ${cafenea}.`,
      details: { locationSlug: result.locationSlug },
    });
    revalidateTeam();
    return { ok: true, text: strings.newPin(result.pin, cafenea), op };
  }

  if (op === "acces-adauga") {
    const locationSlug = String(formData.get("cafenea") ?? "");
    if (!locationSlug) return fail(strings.locationMissing);

    const result = await db.grantStaffLocation(
      id,
      locationSlug,
      typedPin(formData),
    );
    if (result.status === "not_found") return fail(strings.personMissing);
    if (result.status === "shared_account") return fail(strings.sharedAccount);
    if (result.status === "unknown_location") {
      return fail(strings.locationMissing);
    }
    if (result.status === "already_granted") return fail(strings.accessExists);
    if (result.status === "invalid_pin") return fail(strings.badPin);
    if (result.status === "pin_taken") return fail(strings.pinTaken);

    const cafenea = await locationName(result.locationSlug);
    await recordAdminAudit(auth.session, {
      action: "echipa.acces-adaugat",
      target: id,
      summary: `I-a dat lui ${result.staff.name} acces la ${cafenea}.`,
      details: { locationSlug: result.locationSlug },
    });
    revalidateTeam();
    return { ok: true, text: strings.accessAdded(result.pin, cafenea), op };
  }

  if (op === "acces-scoate") {
    const locationSlug = String(formData.get("cafenea") ?? "");
    if (!locationSlug) return fail(strings.locationMissing);

    // Taking your own access away at the cafenea you are standing in ends
    // your own shift on the next request — the same trap `inactiv` guards
    // against, one step sideways.
    if (
      auth.session.staffId === id &&
      auth.session.locationSlug === locationSlug
    ) {
      return fail(strings.ownAccount);
    }

    const result = await db.revokeStaffLocation(id, locationSlug);
    if (result.status === "not_found") return fail(strings.personMissing);
    if (result.status === "shared_account") return fail(strings.sharedAccount);
    if (result.status === "no_access") return fail(strings.accessMissing);

    const cafenea = await locationName(result.locationSlug);
    await recordAdminAudit(auth.session, {
      action: "echipa.acces-scos",
      target: id,
      summary: `I-a scos lui ${result.staff.name} accesul la ${cafenea}.`,
      details: { locationSlug: result.locationSlug },
    });
    revalidateTeam();
    return {
      ok: true,
      text:
        result.staff.locationSlugs.length === 0
          ? strings.accessRemovedLast(cafenea)
          : strings.accessRemoved(cafenea),
      op,
    };
  }

  if (op === "activ" || op === "inactiv") {
    // Deactivating your own personal login would kill this session on the
    // very next request, with nobody left holding a working manager code.
    if (op === "inactiv" && auth.session.staffId === id) {
      return fail(strings.ownAccount);
    }
    // The same trap, one step sideways: a manager who logged in on the SHARED
    // code has no staffId, so the check above misses it and they can switch
    // off the very account holding their shift open — locking out every
    // manager at that cafenea, not just themselves. Turning the shared code
    // off is deliberately allowed, but from a personal login.
    if (op === "inactiv" && auth.session.staffId === undefined) {
      const target = (await db.listStaff(auth.session.locationSlug)).find(
        (person) => person.id === id,
      );
      if (
        target?.shared &&
        target.role === auth.session.role &&
        target.locationSlug === auth.session.locationSlug
      ) {
        return fail(strings.ownSharedAccount);
      }
    }
    const result = await db.setStaffActive(id, op === "activ");
    if (result.status === "not_found") return fail(strings.personMissing);
    await recordAdminAudit(auth.session, {
      action: op === "activ" ? "echipa.reactivare" : "echipa.dezactivare",
      target: id,
      summary:
        op === "activ"
          ? `A reactivat contul ${result.staff.name}.`
          : `A dezactivat contul ${result.staff.name}.`,
    });
    revalidateTeam();
    return {
      ok: true,
      text: op === "activ" ? strings.reactivated : strings.deactivated,
      op,
    };
  }

  return fail(strings.badOp);
}
