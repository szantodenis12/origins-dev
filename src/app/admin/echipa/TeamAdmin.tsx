"use client";

import { useActionState, useId, useState } from "react";
import {
  Check,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import {
  createStaffAction,
  updateStaffAction,
  type TeamSaveState,
} from "./actions";
import {
  SaveNotice,
  fieldClass,
  hintClass,
  labelClass,
  pillClass,
  primaryButton,
  secondaryButton,
} from "../meniu/ui";
import type { StaffRole } from "@/lib/db";

/** Staff screen: Romanian only. */
const strings = {
  title: "Echipă",
  intro:
    "Cine intră în tură și cu ce rol. Adaugi oameni, le schimbi numele și le dai coduri noi de aici.",
  // The one quiet line about the design: after the notice, a code is gone.
  codesNote:
    "Codurile se afișează o singură dată, la creare sau la resetare, și nu rămân salvate în clar. Un cod uitat se înlocuiește cu Cod nou.",
  add: "Adaugă persoană",
  cancel: "Renunță",
  name: "Nume",
  nameHint: "Așa apare în Statistici și pe ștampilele din istoric.",
  cafe: "Cafenea",
  role: "Rol",
  roleBarista: "Barista",
  roleManager: "Manager",
  save: "Adaugă în echipă",
  inactive: "Inactiv",
  shared: "Cont comun",
  sharedNote:
    "Codul comun al cafenelei, din setările serverului. Nu se schimbă de aici. Dezactivează-l după ce toată lumea are cod personal.",
  stampsLabel: "ștampile 30z",
  rename: "Redenumește",
  saveName: "Salvează",
  newCode: "Cod nou",
  deactivate: "Dezactivează",
  reactivate: "Reactivează",
};

const ROLE_LABELS: Record<StaffRole, string> = {
  barista: strings.roleBarista,
  manager: strings.roleManager,
};

/** Compact row action, sized for three side by side on a phone. */
const rowButton =
  "flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-[12px] font-semibold text-ink disabled:opacity-45";

export interface TeamMember {
  id: string;
  name: string;
  role: StaffRole;
  active: boolean;
  /** The cafenea's shared account: env code, no personal code to reset. */
  shared: boolean;
  /** null = no scan row for this person (managers, shared demo accounts). */
  stamps30d: number | null;
}

export interface TeamGroup {
  slug: string;
  name: string;
  members: TeamMember[];
}

export default function TeamAdmin({ groups }: { groups: TeamGroup[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="px-5 pt-4 pb-10">
      <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
        {strings.title}
      </h1>
      <p className="mt-1.5 text-[13px] leading-[1.5] text-ink/72">
        {strings.intro}
      </p>
      <p className="mt-1.5 text-[12px] leading-[1.5] text-muted">
        {strings.codesNote}
      </p>

      <button
        type="button"
        onClick={() => setAdding((value) => !value)}
        className={`mt-4 ${secondaryButton}`}
      >
        {adding ? (
          <X className="size-[17px] text-muted" strokeWidth={2} />
        ) : (
          <Plus className="size-[17px] text-sage-deep" strokeWidth={2.25} />
        )}
        {adding ? strings.cancel : strings.add}
      </button>

      {adding && <NewStaffForm groups={groups} />}

      {/* A cafenea with nobody yet still appears in the add form's select. */}
      {groups.filter((group) => group.members.length > 0).map((group) => (
        <section key={group.slug} className="mt-7">
          <h2 className="text-[11px] font-bold tracking-[0.18em] text-sage-deep uppercase">
            {group.name}
          </h2>
          <div className="mt-1.5 rounded-card border border-line">
            {group.members.map((member, index) => (
              <StaffRow key={member.id} member={member} first={index === 0} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function NewStaffForm({ groups }: { groups: TeamGroup[] }) {
  const [state, formAction, pending] = useActionState(createStaffAction, null);
  const fieldId = useId();

  return (
    <form
      action={formAction}
      className="mt-3 rounded-card border border-line p-4"
    >
      <label className={labelClass} htmlFor={`${fieldId}-nume`}>
        {strings.name}
      </label>
      <input
        id={`${fieldId}-nume`}
        name="nume"
        type="text"
        autoComplete="off"
        placeholder="Ana Pop"
        className={`mt-1.5 ${fieldClass}`}
      />
      <p className={hintClass}>{strings.nameHint}</p>

      <label className={`mt-3 ${labelClass}`} htmlFor={`${fieldId}-cafenea`}>
        {strings.cafe}
      </label>
      <select
        id={`${fieldId}-cafenea`}
        name="cafenea"
        defaultValue={groups[0]?.slug}
        className={`mt-1.5 appearance-none ${fieldClass}`}
      >
        {groups.map((group) => (
          <option key={group.slug} value={group.slug}>
            {group.name}
          </option>
        ))}
      </select>

      <label className={`mt-3 ${labelClass}`} htmlFor={`${fieldId}-rol`}>
        {strings.role}
      </label>
      <select
        id={`${fieldId}-rol`}
        name="rol"
        defaultValue="barista"
        className={`mt-1.5 appearance-none ${fieldClass}`}
      >
        <option value="barista">{strings.roleBarista}</option>
        <option value="manager">{strings.roleManager}</option>
      </select>

      <label className={`mt-3 ${labelClass}`} htmlFor={`${fieldId}-pin`}>
        Cod de acces (PIN 4 cifre)
      </label>
      <input
        id={`${fieldId}-pin`}
        name="pin"
        type="text"
        inputMode="numeric"
        maxLength={4}
        autoComplete="off"
        placeholder="ex: 1234"
        required
        className={`mt-1.5 ${fieldClass}`}
      />
      <p className={hintClass}>Codul de 4 cifre cu care persoana intră în tură.</p>

      <button
        type="submit"
        disabled={pending}
        className={`mt-4 ${primaryButton}`}
      >
        {pending ? (
          <Loader2 className="size-[17px] animate-spin" strokeWidth={2} />
        ) : (
          <Check className="size-[17px]" strokeWidth={2.25} />
        )}
        {strings.save}
      </button>

      <SaveNotice state={state} />
    </form>
  );
}

function StaffRow({ member, first }: { member: TeamMember; first: boolean }) {
  // One state per row: the three small forms share the same dispatch, so the
  // last result (rename, code, activity) is the one shown under the row.
  const [state, formAction, pending] = useActionState(updateStaffAction, null);
  const [editing, setEditing] = useState(false);
  const [editingPin, setEditingPin] = useState(false);
  const fieldId = useId();

  // Close the inline forms only when an operation actually saved.
  const [handled, setHandled] = useState<TeamSaveState>(null);
  if (state !== handled) {
    setHandled(state);
    if (state?.ok && state.op === "redenumeste") setEditing(false);
    if (state?.ok && state.op === "cod") setEditingPin(false);
  }

  return (
    <div className={`px-4 py-3.5 ${first ? "" : "border-t border-line"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div
            className={`truncate text-[14px] font-semibold ${
              member.active ? "text-ink" : "text-muted"
            }`}
          >
            {member.name}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className={`${pillClass} text-sage-deep`}>
              {ROLE_LABELS[member.role]}
            </span>
            {member.shared && (
              <span className={`${pillClass} text-muted`}>
                {strings.shared}
              </span>
            )}
            {!member.active && (
              <span className={`${pillClass} text-muted`}>
                {strings.inactive}
              </span>
            )}
          </div>
        </div>
        {member.stamps30d !== null && (
          <div className="shrink-0 text-right tabular-nums">
            <div className="text-[15px] leading-none font-bold">
              {member.stamps30d}
            </div>
            <div className="mt-0.5 text-[10.5px] text-muted">
              {strings.stampsLabel}
            </div>
          </div>
        )}
      </div>

      {editing && (
        <form action={formAction} className="mt-2.5 flex items-center gap-2">
          <input type="hidden" name="staffId" value={member.id} />
          <input type="hidden" name="op" value="redenumeste" />
          <input
            id={`${fieldId}-nume`}
            name="nume"
            type="text"
            autoComplete="off"
            defaultValue={member.name}
            aria-label={strings.name}
            className={fieldClass}
          />
          <button
            type="submit"
            disabled={pending}
            aria-label={strings.saveName}
            title={strings.saveName}
            className="flex size-[42px] shrink-0 items-center justify-center rounded-btn bg-ink text-paper disabled:opacity-45"
          >
            {pending ? (
              <Loader2 className="size-[16px] animate-spin" strokeWidth={2} />
            ) : (
              <Check className="size-[16px]" strokeWidth={2.25} />
            )}
          </button>
        </form>
      )}

      {editingPin && (
        <form action={formAction} className="mt-2.5 flex items-center gap-2">
          <input type="hidden" name="staffId" value={member.id} />
          <input type="hidden" name="op" value="cod" />
          <input
            id={`${fieldId}-pin`}
            name="pin"
            type="text"
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            placeholder="Cod nou (4 cifre)"
            required
            aria-label="Cod nou"
            className={fieldClass}
          />
          <button
            type="submit"
            disabled={pending}
            className="flex h-[42px] shrink-0 items-center justify-center rounded-btn bg-ink px-3 text-[13px] font-semibold text-paper disabled:opacity-45"
          >
            {pending ? (
              <Loader2 className="size-[16px] animate-spin" strokeWidth={2} />
            ) : (
              "Setează"
            )}
          </button>
        </form>
      )}

      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setEditing((value) => !value);
            setEditingPin(false);
          }}
          className={rowButton}
        >
          {editing ? (
            <X className="size-[13px] text-muted" strokeWidth={2} />
          ) : (
            <Pencil className="size-[13px] text-sage-deep" strokeWidth={2.25} />
          )}
          {editing ? strings.cancel : strings.rename}
        </button>

        {!member.shared && (
          <button
            type="button"
            onClick={() => {
              setEditingPin((val) => !val);
              setEditing(false);
            }}
            className={rowButton}
          >
            {editingPin ? (
              <X className="size-[13px] text-muted" strokeWidth={2} />
            ) : (
              <KeyRound
                className="size-[13px] text-sage-deep"
                strokeWidth={2.25}
              />
            )}
            {editingPin ? strings.cancel : "Resetare cod"}
          </button>
        )}

        <form action={formAction}>
          <input type="hidden" name="staffId" value={member.id} />
          <input
            type="hidden"
            name="op"
            value={member.active ? "inactiv" : "activ"}
          />
          <button type="submit" disabled={pending} className={rowButton}>
            {member.active ? (
              <UserX className="size-[13px] text-muted" strokeWidth={2.25} />
            ) : (
              <UserCheck
                className="size-[13px] text-sage-deep"
                strokeWidth={2.25}
              />
            )}
            {member.active ? strings.deactivate : strings.reactivate}
          </button>
        </form>
      </div>

      {member.shared && (
        <p className="mt-2 text-[11.5px] leading-[1.45] text-muted">
          {strings.sharedNote}
        </p>
      )}

      <SaveNotice state={state} />
    </div>
  );
}
