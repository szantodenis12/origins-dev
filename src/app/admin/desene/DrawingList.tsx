"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  BellRing,
  Camera,
  Check,
  ChevronRight,
  Globe,
  ImageUp,
  Loader2,
  Printer,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  deleteDrawingDataAction,
  markDrawingSubmittedAction,
  setDrawingStatusAction,
  type DrawingAdminState,
} from "./actions";
import { SHEET_KIND_LABEL } from "@/lib/campaign-guards";
import { SHEET_KINDS, type SheetKind } from "@/lib/db/campaign-rules";
import { formatBucharestDate } from "../push/shared";
import {
  canChangeDrawingStatus,
  CONTEST_LOCATIONS,
  type DrawingAttribution,
  type DrawingLocation,
  type DrawingStatus,
} from "@/lib/drawing";

/**
 * The staff list. Rows carry exactly what the screen may show — no parent
 * name, no phone — and the page builds them that way; the export route is
 * the only place those two fields leave the store.
 */

/** Staff screen: Romanian only. */
const strings = {
  empty: "Nicio înscriere aici încă.",
  years: "ani",
  notEligible: "Fără acord de reproducere: doar expus",
  reproduction: "Acord reproducere",
  reproductionNoName: "Acord reproducere, fără prenume",
  noReproduction: "Fără acord de reproducere",
  photo: "Acord foto/video",
  noPhoto: "Fără acord foto/video",
  gallery: "Acord galerie online",
  noGallery: "Fără acord pentru galeria online",
  online: "Online în galerie",
  hasPhoto: "Are fotografie, nepublicat",
  addPhoto: "Fă poza desenului",
  open: "Deschide",
  circle: "Vrea informații Origins Circle",
  noCircle: "Fără informații Origins Circle",
  delete: "Șterge datele campaniei",
  deleteConfirm: "Da, șterge definitiv",
};

const STATUS_LABEL: Record<DrawingStatus, string> = {
  inregistrat: "Înregistrat",
  depus: "Depus",
  expus: "Expus",
  selectat: "Selectat",
  returnat: "Returnat",
};

/**
 * The plain steps a row can offer. "Depus" is recorded with the sheet kind
 * (the "Primit pe" buttons), "selectat" by the selection in the campaign
 * panel: neither is a bare status step any more.
 */
const NEXT_STATUSES: DrawingStatus[] = ["expus", "returnat"];

export interface DrawingRow {
  id: string;
  code: string;
  location: DrawingLocation;
  childFirstName: string;
  childAge: number;
  category: string;
  status: DrawingStatus;
  createdAt: string;
  consentReproduction: boolean;
  attribution: DrawingAttribution;
  consentPhoto: boolean;
  circleOptIn: boolean;
  consentGallery: boolean;
  hasPhoto: boolean;
  live: boolean;
  sheetKind: SheetKind | null;
}

const rowButton =
  "flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-[12px] font-semibold text-ink disabled:opacity-45";

function Notice({ state }: { state: DrawingAdminState }) {
  if (!state) return null;
  return state.ok ? (
    <div
      role="status"
      className="mt-2.5 flex items-start gap-2 rounded-card bg-sage px-3.5 py-2.5 text-[12.5px] font-semibold text-olive"
    >
      <Check className="mt-px size-[15px] shrink-0" strokeWidth={3} />
      <span>{state.text}</span>
    </div>
  ) : (
    <div
      role="alert"
      className="mt-2.5 flex items-start gap-2 rounded-card bg-cream px-3.5 py-2.5 text-[12.5px] font-semibold text-ink"
    >
      <TriangleAlert className="mt-px size-[15px] shrink-0 text-sage-deep" strokeWidth={2} />
      <span>{state.text}</span>
    </div>
  );
}

export default function DrawingList({
  rows,
  manager,
  showLocation,
}: {
  rows: DrawingRow[];
  manager: boolean;
  showLocation: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-line">
        <p className="px-4 py-3.5 text-[12.5px] text-muted">{strings.empty}</p>
      </div>
    );
  }
  return (
    <div className="rounded-card border border-line">
      {rows.map((row, index) => (
        <Row
          key={row.id}
          row={row}
          manager={manager}
          showLocation={showLocation}
          first={index === 0}
        />
      ))}
    </div>
  );
}

function Row({
  row,
  manager,
  showLocation,
  first,
}: {
  row: DrawingRow;
  manager: boolean;
  showLocation: boolean;
  first: boolean;
}) {
  // One state per row: the status forms share the dispatch, the last
  // result is the one shown under the row.
  const [state, formAction, pending] = useActionState(setDrawingStatusAction, null);
  const [submitState, submitAction, submitPending] = useActionState(markDrawingSubmittedAction, null);
  const role = manager ? "manager" : "barista";
  const next = NEXT_STATUSES.filter((status) =>
    canChangeDrawingStatus(row.status, status, role),
  );
  const locationName =
    CONTEST_LOCATIONS.find((item) => item.slug === row.location)?.name ?? row.location;
  const iconClass = (on: boolean) =>
    `size-[14px] ${on ? "text-sage-deep" : "text-line"}`;

  return (
    <div className={`px-4 py-3.5 ${first ? "" : "border-t border-line"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[17px] leading-none font-extrabold tracking-[-0.01em] tabular-nums">
            {row.code}
          </div>
          <div className="mt-1.5 truncate text-[13.5px] font-semibold text-ink">
            {row.childFirstName}, {row.childAge} {strings.years}
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted">
            {row.category} {strings.years} · {formatBucharestDate(row.createdAt)}
            {showLocation ? ` · ${locationName}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="inline-flex items-center rounded-full bg-cream px-2.5 py-1 text-[10.5px] font-semibold text-sage-deep">
            {STATUS_LABEL[row.status]}
            {row.sheetKind ? ` · ${SHEET_KIND_LABEL[row.sheetKind]}` : ""}
          </span>
          <div className="flex items-center gap-1.5">
            <Printer
              className={iconClass(row.consentReproduction)}
              strokeWidth={2.25}
              aria-label={
                row.consentReproduction
                  ? row.attribution === "none"
                    ? strings.reproductionNoName
                    : strings.reproduction
                  : strings.noReproduction
              }
            />
            <Globe
              className={iconClass(row.consentGallery)}
              strokeWidth={2.25}
              aria-label={row.consentGallery ? strings.gallery : strings.noGallery}
            />
            <Camera
              className={iconClass(row.consentPhoto)}
              strokeWidth={2.25}
              aria-label={row.consentPhoto ? strings.photo : strings.noPhoto}
            />
            <BellRing
              className={iconClass(row.circleOptIn)}
              strokeWidth={2.25}
              aria-label={row.circleOptIn ? strings.circle : strings.noCircle}
            />
          </div>
        </div>
      </div>

      {/* The door to the photo screen: camera, crop, publish. */}
      <Link
        href={`/admin/desene/${row.id}`}
        className="mt-2.5 flex items-center justify-between gap-2 rounded-btn bg-cream px-3.5 py-2.5 text-[12.5px] font-semibold text-ink"
      >
        <span className="flex items-center gap-2">
          {row.live ? (
            <Globe className="size-[14px] text-open" strokeWidth={2.25} />
          ) : (
            <ImageUp className="size-[14px] text-sage-deep" strokeWidth={2.25} />
          )}
          {row.live ? strings.online : row.hasPhoto ? strings.hasPhoto : strings.addPhoto}
        </span>
        <ChevronRight className="size-[15px] text-muted" strokeWidth={2.25} aria-label={strings.open} />
      </Link>

      {row.status === "inregistrat" && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold text-ink/72">Primit în cafenea, pe:</span>
          {SHEET_KINDS.map((kind) => (
            <form key={kind} action={submitAction}>
              <input type="hidden" name="entryId" value={row.id} />
              <input type="hidden" name="sheetKind" value={kind} />
              <button type="submit" disabled={submitPending} className={rowButton}>
                {submitPending ? (
                  <Loader2 className="size-[13px] animate-spin" strokeWidth={2} />
                ) : (
                  <Check className="size-[13px] text-sage-deep" strokeWidth={2.25} />
                )}
                {SHEET_KIND_LABEL[kind]}
              </button>
            </form>
          ))}
        </div>
      )}
      <Notice state={submitState} />

      {next.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {next.map((status) => {
            return (
              <form key={status} action={formAction}>
                <input type="hidden" name="entryId" value={row.id} />
                <input type="hidden" name="status" value={status} />
                <button
                  type="submit"
                  disabled={pending}
                  className={rowButton}
                >
                  {pending ? (
                    <Loader2 className="size-[13px] animate-spin" strokeWidth={2} />
                  ) : (
                    <Check className="size-[13px] text-sage-deep" strokeWidth={2.25} />
                  )}
                  {STATUS_LABEL[status]}
                </button>
              </form>
            );
          })}
        </div>
      )}

      <Notice state={state} />
    </div>
  );
}

/**
 * Manager-only, two presses: the first comes back with the count and a
 * token, the second posts the token. The decision is made on the server
 * on every press (actions.ts), this only shows what it said.
 */
export function DeleteCampaign() {
  const [state, formAction, pending] = useActionState(deleteDrawingDataAction, null);
  const confirmToken = state && !state.ok ? state.confirmToken : undefined;

  return (
    <form action={formAction}>
      {confirmToken && <input type="hidden" name="confirmare" value={confirmToken} />}
      <button
        type="submit"
        disabled={pending}
        className={`flex w-full items-center justify-center gap-2 rounded-btn p-[13px] text-[14px] font-semibold disabled:opacity-45 ${
          confirmToken ? "bg-ink text-paper" : "border border-line bg-paper text-ink"
        }`}
      >
        {pending ? (
          <Loader2 className="size-[16px] animate-spin" strokeWidth={2} />
        ) : (
          <Trash2
            className={`size-[16px] ${confirmToken ? "" : "text-sage-deep"}`}
            strokeWidth={2}
          />
        )}
        {confirmToken ? strings.deleteConfirm : strings.delete}
      </button>
      <Notice state={state} />
    </form>
  );
}
