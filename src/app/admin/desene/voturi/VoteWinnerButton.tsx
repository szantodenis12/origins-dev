"use client";

import { useActionState } from "react";
import { Check, Loader2, Trophy, TriangleAlert, X } from "lucide-react";
import { setVoteWinnerAction } from "../actions";

/** Staff screen: Romanian only. */
const strings = {
  mark: "Marchează câștigător vot public",
  unmark: "Scoate marcajul",
};

export default function VoteWinnerButton({
  entryId,
  winner,
}: {
  entryId: string;
  winner: boolean;
}) {
  const [state, formAction, pending] = useActionState(setVoteWinnerAction, null);

  return (
    <form action={formAction} className="mt-2.5">
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="castigator" value={winner ? "0" : "1"} />
      <button
        type="submit"
        disabled={pending}
        className="flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-[12px] font-semibold text-ink disabled:opacity-45"
      >
        {pending ? (
          <Loader2 className="size-[13px] animate-spin" strokeWidth={2} />
        ) : winner ? (
          <X className="size-[13px] text-sage-deep" strokeWidth={2.25} />
        ) : (
          <Trophy className="size-[13px] text-sage-deep" strokeWidth={2.25} />
        )}
        {winner ? strings.unmark : strings.mark}
      </button>
      {state && (
        <div
          role={state.ok ? "status" : "alert"}
          className={`mt-2 flex items-start gap-2 rounded-card px-3.5 py-2.5 text-[12.5px] font-semibold ${
            state.ok ? "bg-sage text-olive" : "bg-cream text-ink"
          }`}
        >
          {state.ok ? (
            <Check className="mt-px size-[15px] shrink-0" strokeWidth={3} />
          ) : (
            <TriangleAlert className="mt-px size-[15px] shrink-0 text-sage-deep" strokeWidth={2} />
          )}
          <span>{state.text}</span>
        </div>
      )}
    </form>
  );
}
