"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState } from "react";
import { Camera, Check, ChevronRight, Globe, Loader2, Trash2, TriangleAlert, Trophy, X } from "lucide-react";
import {
  deleteDrawingDataAction,
  markDrawingSubmittedAction,
  setDrawingStatusAction,
  setVoteWinnerAction,
  type DrawingAdminState,
} from "@/app/admin/desene/actions";
import { SHEET_KIND_LABEL } from "@/lib/campaign-guards";
import { SHEET_KINDS, type SheetKind } from "@/lib/db/campaign-rules";
import { canChangeDrawingStatus, type DrawingStatus } from "@/lib/drawing";
import { BTN_GREEN, BTN_PRIMARY, BTN_QUIET, CHIP, NOTE, STATUS_LABEL } from "./ui";

/**
 * The client pieces of the campaign panel's lists. They only render and
 * submit: every decision is made by the existing drawings server functions
 * (app/admin/desene/actions.ts), the same ones the Origins admin calls.
 */

export function Notice({ state }: { state: DrawingAdminState }) {
  if (!state) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={`flex items-start gap-2.5 rounded-2xl px-4 py-3.5 text-[14.5px] leading-[1.45] font-semibold ${
        state.ok ? "bg-o-green text-white" : "bg-o-wall text-o-ink"
      }`}
    >
      {state.ok ? (
        <Check className="mt-0.5 size-[17px] shrink-0" strokeWidth={2.5} />
      ) : (
        <TriangleAlert className="mt-0.5 size-[17px] shrink-0" strokeWidth={1.75} />
      )}
      {state.text}
    </p>
  );
}

export interface PanelRow {
  id: string;
  code: string;
  childFirstName: string;
  childAge: number;
  category: string;
  locationName: string;
  status: DrawingStatus;
  consentGallery: boolean;
  consentReproduction: boolean;
  image: string | null;
  live: boolean;
  sheetKind: SheetKind | null;
}

/**
 * "Depus" is recorded with the sheet kind (the buttons below), "selectat"
 * on the selection screen: the plain steps left are these two.
 */
const NEXT: DrawingStatus[] = ["expus", "returnat"];

/** "Primit în cafenea" for a preregistered code: one tap per sheet kind. */
function SubmitButtons({ entryId }: { entryId: string }) {
  const [state, action, pending] = useActionState(markDrawingSubmittedAction, null);
  return (
    <div className="mt-3.5 flex flex-col gap-2">
      <p className="text-[14px] font-semibold">Primit în cafenea, pe:</p>
      <div className="grid grid-cols-3 gap-2">
        {SHEET_KINDS.map((kind) => (
          <form key={kind} action={action}>
            <input type="hidden" name="entryId" value={entryId} />
            <input type="hidden" name="sheetKind" value={kind} />
            <button
              type="submit"
              disabled={pending}
              className={`${kind === "alta-foaie" ? BTN_QUIET : BTN_PRIMARY} !min-h-[48px] !px-2 !text-[14px]`}
            >
              {pending ? <Loader2 className="size-[16px] animate-spin" strokeWidth={2} /> : null}
              {SHEET_KIND_LABEL[kind]}
            </button>
          </form>
        ))}
      </div>
      <Notice state={state} />
    </div>
  );
}

/** One drawing in the list: the photo action first, the status steps under it. */
export function DrawingRow({ row, manager }: { row: PanelRow; manager: boolean }) {
  const [state, action, pending] = useActionState(setDrawingStatusAction, null);
  const next = NEXT.filter((status) =>
    canChangeDrawingStatus(row.status, status, manager ? "manager" : "barista"),
  );

  return (
    <li className="rounded-3xl border border-o-ink/12 p-4">
      <Link href={`/admin/${row.id}`} className="flex items-center gap-4">
        <span className="relative flex size-[76px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-o-wall">
          {row.image ? (
            <Image src={row.image} alt="" fill sizes="76px" className="object-contain p-1" />
          ) : (
            <Camera className="size-[26px] text-o-ink/45" strokeWidth={1.5} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[24px] leading-none font-extrabold tracking-[-0.01em] tabular-nums">
            {row.code}
          </span>
          <span className="mt-1.5 block truncate text-[15.5px] font-semibold">
            {row.childFirstName}, {row.childAge} ani
          </span>
          <span className="mt-0.5 block text-[13.5px] text-o-ink/60">
            {row.category.replace("-", "–")} ani · {row.locationName}
          </span>
        </span>
        <ChevronRight className="size-[22px] shrink-0 text-o-ink/40" strokeWidth={1.75} />
      </Link>

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <span className={`${CHIP} !min-h-[36px] bg-o-wall !px-3.5 !text-[13px]`}>
          {STATUS_LABEL[row.status]}
        </span>
        {row.sheetKind && (
          <span
            className={`${CHIP} !min-h-[36px] border border-o-ink/15 !px-3.5 !text-[13px] ${
              row.sheetKind === "alta-foaie" ? "text-o-ink/70" : ""
            }`}
          >
            {SHEET_KIND_LABEL[row.sheetKind]}
          </span>
        )}
        {row.live ? (
          <span className={`${CHIP} !min-h-[36px] gap-1.5 bg-o-green !px-3.5 !text-[13px] text-white`}>
            <Globe className="size-[14px]" strokeWidth={2} />
            Online
          </span>
        ) : (
          !row.consentGallery && (
            <span className={`${CHIP} !min-h-[36px] border border-o-ink/15 !px-3.5 !text-[13px] text-o-ink/70`}>
              Fără acord online
            </span>
          )
        )}
      </div>

      <Link
        href={`/admin/${row.id}`}
        className={`${row.image ? BTN_QUIET : BTN_PRIMARY} mt-3.5`}
      >
        <Camera className="size-[20px]" strokeWidth={1.75} />
        {row.image ? (row.live ? "Deschide desenul" : "Fotografie și publicare") : "Fotografiază desenul"}
      </Link>

      {row.status === "inregistrat" && <SubmitButtons entryId={row.id} />}

      {next.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {next.map((status) => {
            return (
              <form key={status} action={action} className="flex-1">
                <input type="hidden" name="entryId" value={row.id} />
                <input type="hidden" name="status" value={status} />
                <button
                  type="submit"
                  disabled={pending}
                  className={`${BTN_QUIET} !min-h-[48px] !px-3 !text-[14.5px]`}
                >
                  {pending ? (
                    <Loader2 className="size-[16px] animate-spin" strokeWidth={2} />
                  ) : (
                    <Check className="size-[16px]" strokeWidth={2} />
                  )}
                  {STATUS_LABEL[status]}
                </button>
              </form>
            );
          })}
        </div>
      )}
      {state && (
        <div className="mt-2.5">
          <Notice state={state} />
        </div>
      )}
    </li>
  );
}

/** Manager: mark or unmark the public-vote winner of an age group. */
export function WinnerButton({ entryId, winner }: { entryId: string; winner: boolean }) {
  const [state, action, pending] = useActionState(setVoteWinnerAction, null);
  return (
    <form action={action} className="mt-3 flex flex-col gap-2.5">
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="castigator" value={winner ? "0" : "1"} />
      <button type="submit" disabled={pending} className={winner ? BTN_QUIET : BTN_GREEN}>
        {pending ? (
          <Loader2 className="size-[18px] animate-spin" strokeWidth={2} />
        ) : winner ? (
          <X className="size-[18px]" strokeWidth={2} />
        ) : (
          <Trophy className="size-[18px]" strokeWidth={1.75} />
        )}
        {winner ? "Scoate marcajul" : "Marchează câștigător vot public"}
      </button>
      <Notice state={state} />
    </form>
  );
}

/** Manager, end of campaign: two presses, the server decides on each. */
export function DeleteData() {
  const [state, action, pending] = useActionState(deleteDrawingDataAction, null);
  const token = state && !state.ok ? state.confirmToken : undefined;
  return (
    <form action={action} className="flex flex-col gap-2.5">
      {token && <input type="hidden" name="confirmare" value={token} />}
      <button type="submit" disabled={pending} className={token ? BTN_PRIMARY : BTN_QUIET}>
        {pending ? (
          <Loader2 className="size-[18px] animate-spin" strokeWidth={2} />
        ) : (
          <Trash2 className="size-[18px]" strokeWidth={1.75} />
        )}
        {token ? "Da, șterge definitiv" : "Șterge datele concursului"}
      </button>
      {state && (state.ok ? <Notice state={state} /> : <p className={NOTE}>{state.text}</p>)}
    </form>
  );
}
