"use client";

import { useCallback, useRef, useState } from "react";
import { Check, Loader2, Search, TriangleAlert } from "lucide-react";
import MemberPanel, { type PendingAction } from "./MemberPanel";
import QrScanner from "./QrScanner";
import {
  addStampAction,
  forgetMemberAction,
  lookupMemberAction,
  redeemRewardAction,
  reissuePassSerialAction,
  reviewBonusAction,
  setMemberBlockedAction,
  verifyStudentAction,
  withdrawMarketingConsentAction,
} from "@/app/admin/actions";
import type {
  MemberPanel as Panel,
  PanelNotice,
  PanelResult,
} from "@/lib/admin/panel";
import type { RewardId } from "@/lib/loyalty";

/** Staff screen: Romanian only. */
const strings = {
  serial: "Seria de pe card sau nr. de telefon",
  serialPlaceholder: "ORIG-XXXX-XXXX / 07xx xxx xxx",
  search: "Caută cardul",
  notFound: (input: string) => `Nu găsim niciun card pentru ${input}.`,
  invalid: "Scrie seria de pe card sau numărul de telefon.",
  unauthorized: "Sesiunea a expirat. Intră din nou în tură.",
  failed: "Nu am putut face operațiunea. Mai încearcă o dată.",
  demo: "Carduri demo: ORIG-DEMO-0001 până la ORIG-DEMO-0010",
  forgotten: "Membrul și datele lui personale au fost șterse definitiv.",
};

function messageFor(reason: string, serial: string): string {
  if (reason === "not_found") return strings.notFound(serial);
  if (reason === "invalid") return strings.invalid;
  if (reason === "unauthorized") return strings.unauthorized;
  return strings.failed;
}

export default function ScanView({ manager }: { manager: boolean }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [notice, setNotice] = useState<PanelNotice | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  /** One-line confirmation shown on the scanner after an erasure. */
  const [done, setDone] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [looking, setLooking] = useState(false);

  /** Blocks the camera loop from firing the same card a second time. */
  const busyRef = useRef(false);

  const apply = useCallback((result: PanelResult, serial: string) => {
    if (result.ok) {
      setPanel(result.panel);
      setNotice(result.notice ?? null);
      setError(null);
      return true;
    }
    setError(messageFor(result.reason, serial));
    return false;
  }, []);

  const lookup = useCallback(
    async (raw: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setLooking(true);
      setNotice(null);
      setDone(null);

      try {
        const result = await lookupMemberAction(raw);
        // Stay busy while a member panel is open; "scanează alt card" clears it.
        if (!apply(result, raw.trim().toUpperCase())) busyRef.current = false;
      } catch {
        setError(strings.failed);
        busyRef.current = false;
      } finally {
        setLooking(false);
      }
    },
    [apply],
  );

  const run = useCallback(
    async (action: PendingAction, call: () => Promise<PanelResult>) => {
      setPending(action);
      try {
        const result = await call();
        apply(result, panel?.passSerial ?? "");
      } catch {
        setError(strings.failed);
      } finally {
        setPending(null);
      }
    },
    [apply, panel],
  );

  const reset = useCallback(() => {
    busyRef.current = false;
    setPanel(null);
    setNotice(null);
    setError(null);
    setManual("");
  }, []);

  /**
   * Erasure has no panel to come back to: on success the screen returns to
   * the scanner with a one-line confirmation instead of a member card.
   */
  const forget = useCallback(async () => {
    if (!panel) return;
    setPending({ type: "forget" });
    try {
      const result = await forgetMemberAction(panel.memberId);
      if (!result.ok) {
        setError(messageFor(result.reason, panel.passSerial));
        return;
      }
      reset();
      setDone(strings.forgotten);
    } catch {
      setError(strings.failed);
    } finally {
      setPending(null);
    }
  }, [panel, reset]);

  if (panel) {
    return (
      <>
        {error && <ErrorNote text={error} />}
        <MemberPanel
          panel={panel}
          notice={notice}
          pending={pending}
          manager={manager}
          onAddStamp={() =>
            void run({ type: "stamp" }, () => addStampAction(panel.memberId))
          }
          onRedeem={(rewardId: RewardId) =>
            void run({ type: "redeem", rewardId }, () =>
              redeemRewardAction(panel.memberId, rewardId),
            )
          }
          onReviewBonus={() =>
            void run({ type: "review" }, () => reviewBonusAction(panel.memberId))
          }
          onVerifyStudent={() =>
            void run({ type: "student" }, () =>
              verifyStudentAction(panel.memberId),
            )
          }
          onSetBlocked={(blocked: boolean) =>
            void run({ type: "block" }, () =>
              setMemberBlockedAction(panel.memberId, blocked),
            )
          }
          onReissue={() =>
            void run({ type: "reissue" }, () =>
              reissuePassSerialAction(panel.memberId),
            )
          }
          onWithdrawMarketing={() =>
            void run({ type: "marketing" }, () =>
              withdrawMarketingConsentAction(panel.memberId),
            )
          }
          onForget={() => void forget()}
          onReset={reset}
        />
      </>
    );
  }

  return (
    <div className="px-5 pt-4 pb-2">
      <QrScanner onDecode={(text) => void lookup(text)} paused={looking} />

      {error && (
        <div className="mt-4">
          <ErrorNote text={error} />
        </div>
      )}

      {done && (
        <div
          role="status"
          className="mt-4 flex items-start gap-2.5 rounded-card bg-sage p-4 text-[13px] font-semibold text-olive"
        >
          <Check className="mt-px size-[18px] shrink-0" strokeWidth={3} />
          <span>{done}</span>
        </div>
      )}

      <form
        className="mt-5"
        onSubmit={(event) => {
          event.preventDefault();
          void lookup(manual);
        }}
      >
        <label
          className="block text-[12.5px] font-semibold text-ink/72"
          htmlFor="serial"
        >
          {strings.serial}
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="serial"
            name="serial"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={strings.serialPlaceholder}
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            className="w-full rounded-btn border border-line bg-paper px-3.5 py-3 text-[15px] tracking-[0.04em] text-ink uppercase outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-muted focus:border-sage-deep"
          />
          <button
            type="submit"
            disabled={looking || manual.trim().length === 0}
            aria-label={strings.search}
            className="flex shrink-0 items-center justify-center rounded-btn bg-ink px-4 text-paper disabled:opacity-45"
          >
            {looking ? (
              <Loader2 className="size-[18px] animate-spin" strokeWidth={2} />
            ) : (
              <Search className="size-[18px]" strokeWidth={2} />
            )}
          </button>
        </div>

        {process.env.NODE_ENV !== "production" && (
          <p className="mt-2.5 text-[12px] text-muted">{strings.demo}</p>
        )}
      </form>
    </div>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-card bg-cream p-4 text-[13px] font-semibold text-ink"
    >
      <TriangleAlert
        className="mt-px size-[18px] shrink-0 text-sage-deep"
        strokeWidth={2}
      />
      <span>{text}</span>
    </div>
  );
}
