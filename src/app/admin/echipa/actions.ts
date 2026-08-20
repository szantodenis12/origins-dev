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
 * carry names only, never a code.
 */

export type TeamOp = "redenumeste" | "cod" | "activ" | "inactiv";

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
  // Mirrors the add-café wording: the code exists only in this notice.
  created: (pin: string) =>
    `Persoană adăugată. Codul (se afișează o singură dată): ${pin}. Notează-l acum.`,
  newPin: (pin: string) =>
    `Cod nou (se afișează o singură dată): ${pin}. Notează-l acum. Cel vechi nu mai funcționează.`,
  pinFailed: "Codul nu a putut fi schimbat. Mai încearcă.",
  sharedAccount:
    "Contul comun folosește codul din setările serverului. Se schimbă de acolo, nu de aici.",
  deactivated:
    "Persoana nu mai poate intra în tură. Ștampilele din istoric rămân la numele ei.",
  reactivated: "Persoana poate intra din nou în tură.",
  ownAccount: "Nu poți dezactiva contul cu care ești în tură acum.",
  ownSharedAccount:
    "Ești în tură chiar pe contul comun. Intră cu un cod personal de manager, apoi oprește-l de acolo.",
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
  });

  if (result.status === "invalid_name") return fail(strings.nameMissing);
  if (result.status === "unknown_location") return fail(strings.locationMissing);

  const cafenea = await locationName(result.staff.locationSlug);
  await recordAdminAudit(auth.session, {
    action: "echipa.adaugare",
    target: result.staff.id,
    summary: `A adăugat ${result.staff.name} (${rol}) la ${cafenea}.`,
  });

  revalidateTeam();
  return { ok: true, text: strings.created(result.pin), op: "adauga" };
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

  if (op === "cod") {
    // Reset only: a generated code cannot be invalid and cannot collide.
    const result = await db.setStaffPin(id);
    if (result.status === "not_found") return fail(strings.personMissing);
    // The button is hidden for shared accounts, but a direct POST is not.
    if (result.status === "shared_account") return fail(strings.sharedAccount);
    if (result.status !== "set") return fail(strings.pinFailed);
    // The code itself never touches the Jurnal — only that it changed.
    await recordAdminAudit(auth.session, {
      action: "echipa.cod-nou",
      target: id,
      summary: `A generat cod nou pentru ${result.staff.name}.`,
    });
    revalidateTeam();
    return { ok: true, text: strings.newPin(result.pin), op };
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
