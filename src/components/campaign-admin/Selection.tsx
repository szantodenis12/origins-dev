"use client";

import { useActionState } from "react";
import { Check, Gift, Loader2, Megaphone, Trophy, X } from "lucide-react";
import {
  confirmCollectionAction,
  publishResultsAction,
  setJuryWinnerAction,
  setReserveRankAction,
  setWinnerAcceptedAction,
} from "@/app/admin/desene/actions";
import { Notice } from "./Rows";
import { BTN_GREEN, BTN_PRIMARY, BTN_QUIET } from "./ui";

/**
 * The client pieces of the selection screen. They only submit: every rule
 * (phase, order vote-then-jury, printable, ten cups) is decided by the
 * server functions in app/admin/desene/actions.ts.
 */

const SMALL = "!min-h-[44px] !px-3 !text-[14px]";

export function JuryButton({ entryId, picked, disabled }: { entryId: string; picked: boolean; disabled: boolean }) {
  const [state, action, pending] = useActionState(setJuryWinnerAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="juriu" value={picked ? "0" : "1"} />
      <button type="submit" disabled={pending || disabled} className={`${picked ? BTN_QUIET : BTN_GREEN} ${SMALL}`}>
        {pending ? (
          <Loader2 className="size-[16px] animate-spin" strokeWidth={2} />
        ) : picked ? (
          <X className="size-[16px]" strokeWidth={2} />
        ) : (
          <Trophy className="size-[16px]" strokeWidth={1.75} />
        )}
        {picked ? "Scoate din alegerile juriului" : "Ales de juriu"}
      </button>
      <Notice state={state} />
    </form>
  );
}

export function ReserveForm({
  entryId,
  rank,
  disabled,
}: {
  entryId: string;
  rank: number | null;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(setReserveRankAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="entryId" value={entryId} />
      <div className="flex gap-2">
        <input
          name="rang"
          type="text"
          inputMode="numeric"
          defaultValue={rank ?? ""}
          placeholder="Rezervă nr."
          aria-label="Rangul de rezervă"
          disabled={disabled}
          className="min-h-[44px] w-full rounded-2xl border border-o-ink/20 bg-white px-3 text-[15px] outline-none focus:border-o-ink"
        />
        <button type="submit" disabled={pending || disabled} className={`${BTN_QUIET} ${SMALL} !w-auto shrink-0`}>
          {pending ? <Loader2 className="size-[16px] animate-spin" strokeWidth={2} /> : <Check className="size-[16px]" strokeWidth={2} />}
          Salvează
        </button>
      </div>
      <Notice state={state} />
    </form>
  );
}

export function AcceptForm({
  entryId,
  acceptedLabel,
  disabled,
}: {
  entryId: string;
  acceptedLabel: string | null;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(setWinnerAcceptedAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="entryId" value={entryId} />
      {acceptedLabel ? (
        <>
          <input type="hidden" name="anulare" value="1" />
          <p className="text-[14px] font-semibold">Acceptat: {acceptedLabel}</p>
          <button type="submit" disabled={pending || disabled} className={`${BTN_QUIET} ${SMALL}`}>
            {pending ? <Loader2 className="size-[16px] animate-spin" strokeWidth={2} /> : <X className="size-[16px]" strokeWidth={2} />}
            Șterge acceptarea
          </button>
        </>
      ) : (
        <div className="flex gap-2">
          <input
            name="data"
            type="text"
            placeholder="05.12.2026 18:30 (gol = acum)"
            aria-label="Data acceptării"
            disabled={disabled}
            className="min-h-[44px] w-full rounded-2xl border border-o-ink/20 bg-white px-3 text-[15px] outline-none focus:border-o-ink"
          />
          <button type="submit" disabled={pending || disabled} className={`${BTN_PRIMARY} ${SMALL} !w-auto shrink-0`}>
            {pending ? <Loader2 className="size-[16px] animate-spin" strokeWidth={2} /> : <Check className="size-[16px]" strokeWidth={2} />}
            A acceptat
          </button>
        </div>
      )}
      <Notice state={state} />
    </form>
  );
}

export function PublishResultsButton({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(publishResultsAction, null);
  return (
    <form action={action} className="flex flex-col gap-2.5">
      <button type="submit" disabled={pending || !enabled} className={BTN_GREEN}>
        {pending ? <Loader2 className="size-[18px] animate-spin" strokeWidth={2} /> : <Megaphone className="size-[18px]" strokeWidth={1.75} />}
        Publică rezultatele
      </button>
      <Notice state={state} />
    </form>
  );
}

export function OpenCollectionButton({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(confirmCollectionAction, null);
  return (
    <form action={action} className="flex flex-col gap-2.5">
      <button type="submit" disabled={pending || !enabled} className={BTN_PRIMARY}>
        {pending ? <Loader2 className="size-[18px] animate-spin" strokeWidth={2} /> : <Gift className="size-[18px]" strokeWidth={1.75} />}
        Paharele au ajuns: deschide ridicarea
      </button>
      <Notice state={state} />
    </form>
  );
}
