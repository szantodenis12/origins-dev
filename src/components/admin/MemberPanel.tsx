"use client";

import { useState } from "react";
import {
  BadgeCheck,
  Ban,
  BellOff,
  Check,
  ChevronDown,
  ChevronUp,
  Crown,
  ExternalLink,
  Gift,
  GraduationCap,
  History,
  Loader2,
  LockOpen,
  MessageSquareQuote,
  QrCode,
  RotateCcw,
  Stamp,
  UserX,
} from "lucide-react";
import StampRow from "@/components/StampRow";
import type { MemberPanel as Panel, PanelNotice } from "@/lib/admin/panel";
import {
  formatBucharestDate,
  formatBucharestDateTime,
} from "@/app/admin/push/shared";
import { formatBucharestTime, type RewardId } from "@/lib/loyalty";

/** Staff screen: Romanian only. */
const strings = {
  gold: "Origins Gold",
  goldUntil: (date: string) =>
    `Gold: o vizită până la ${date} păstrează statutul.`,
  goldLost: (date: string, cards: number) =>
    cards === 1
      ? `A fost Gold, pierdut pe ${date}. Un card complet îl aduce înapoi.`
      : `A fost Gold, pierdut pe ${date}. ${cards} carduri complete îl aduc înapoi.`,
  student: "Student Circle",
  verified: "Legitimație validată",
  toVerify: "Legitimație nevalidată",
  progress: (done: number, total: number) => `${done} din ${total} ștampile`,
  full: (total: number) => `Card plin. ${total} din ${total} ștampile.`,
  goldCard: (total: number) => `Card Gold: ${total} ștampile.`,
  blocked: (time: string) => `Ștampilat aici recent. Următoarea de la ${time}.`,
  addStamp: "Adaugă ștampilă",
  addStampDouble: "Adaugă ștampilă dublă",
  doubleHint: (window: string) => `${window}: ștampila numără de două ori.`,
  perkReady: (name: string) => `Perioada asta: ${name}.`,
  perkUsed: (name: string, date: string) =>
    `Recompensa perioadei, predată pe ${date}: ${name}.`,
  perkUntil: (date: string) => `Disponibil până pe ${date}.`,
  toGoOnly: "Doar la pachet",
  redeem: (reward: string) => `Predă: ${reward}`,
  confirmToGo: "Confirmi? Doar la pachet.",
  capLine: (amount: string) =>
    `Recompensele acoperă produse de cel mult ${amount}.`,
  reviewBonus: "Ștampilă bonus recenzie",
  verifyStudent: "Validează legitimația",
  reset: "Scanează alt card",
  total: (count: number) => `${count} ștampile de la înscriere`,
  openCard: "Deschide cardul web",
  // Blocat de manager (Db.setMemberBlocked) — nu fereastra de 2 ore.
  blockedLine: (date: string) =>
    `Card blocat din ${date}. Nu primește ștampile și nu predă recompense.`,
  block: "Blochează cardul",
  unblock: "Deblochează cardul",
  reissue: "Cod QR nou",
  confirmBlock: "Confirmi? Cardul nu mai primește ștampile.",
  confirmUnblock: "Confirmi? Cardul primește iar ștampile.",
  confirmReissue: "Confirmi? Codul vechi nu va mai funcționa.",
  withdrawMarketing: "Retrage acordul promoțional",
  confirmWithdrawMarketing: "Confirmi? Nu va mai primi mesaje promoționale.",
  forget: "Șterge membrul definitiv",
  confirmForget: "Confirmi? Ștergerea e definitivă, fără recuperare.",
  history: "Istoricul cardului",
};

export type PendingAction =
  | { type: "stamp" }
  | { type: "redeem"; rewardId: RewardId }
  | { type: "review" }
  | { type: "student" }
  | { type: "block" }
  | { type: "reissue" }
  | { type: "marketing" }
  | { type: "forget" }
  | null;

/** Everything a second press can be armed for. */
type Confirming = RewardId | "block" | "unblock" | "reissue" | "marketing" | "forget";

export default function MemberPanel({
  panel,
  notice,
  pending,
  manager,
  onAddStamp,
  onRedeem,
  onReviewBonus,
  onVerifyStudent,
  onSetBlocked,
  onReissue,
  onWithdrawMarketing,
  onForget,
  onReset,
}: {
  panel: Panel;
  notice: PanelNotice | null;
  pending: PendingAction;
  /** Shows the card-control buttons; the server re-checks the role anyway. */
  manager: boolean;
  onAddStamp: () => void;
  onRedeem: (rewardId: RewardId) => void;
  onReviewBonus: () => void;
  onVerifyStudent: () => void;
  onSetBlocked: (blocked: boolean) => void;
  onReissue: () => void;
  onWithdrawMarketing: () => void;
  onForget: () => void;
  onReset: () => void;
}) {
  // The server decides what the stamp is worth; the button only mirrors it.
  const double = panel.doubleStamp;
  const busy = pending !== null;
  const filled = Math.min(panel.progress, panel.cycleLength);
  const showStudentVerify = panel.isStudent && !panel.studentVerified;
  const blocked = panel.blockedAt !== null;

  // Takeaway-only perks need a deliberate second press (Roland, 07.08.2026):
  // the first tap turns the button into "Confirmi? Doar la pachet.", so the
  // barista registers the rule before handing anything to a table. The card
  // controls (blocare, cod QR nou) reuse the same two-step. No browser modal
  // — confirm()/alert() would freeze the team's automation. Any other
  // action, or the press itself, drops the armed state.
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const act = (action: () => void) => {
    setConfirming(null);
    action();
  };

  const pressRedeem = (reward: { id: RewardId; toGoOnly: boolean }) => {
    if (reward.toGoOnly && confirming !== reward.id) {
      setConfirming(reward.id);
      return;
    }
    act(() => onRedeem(reward.id));
  };

  /** Two-step for the card controls: first press arms, second one acts. */
  const pressControl = (key: Confirming, action: () => void) => {
    if (confirming !== key) {
      setConfirming(key);
      return;
    }
    act(action);
  };

  const primary =
    "flex w-full items-center justify-center gap-2 rounded-btn p-[15px] text-[15px] font-semibold disabled:opacity-45";
  const secondary =
    "flex w-full items-center justify-center gap-2 rounded-btn border border-line bg-paper p-[13px] text-[14px] font-semibold text-ink disabled:opacity-45";

  return (
    <div className="px-5 pt-4 pb-2">
      {notice && (
        <div
          className={
            notice.tone === "success"
              ? "mb-4 flex items-start gap-2.5 rounded-card bg-sage p-4 text-[13.5px] font-semibold text-olive"
              : "mb-4 flex items-start gap-2.5 rounded-card bg-cream p-4 text-[13.5px] font-semibold text-ink"
          }
          role="status"
        >
          {notice.tone === "success" ? (
            <Check className="mt-px size-[18px] shrink-0" strokeWidth={3} />
          ) : (
            <Stamp
              className="mt-px size-[18px] shrink-0 text-muted"
              strokeWidth={2}
            />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.02em]">
        {panel.name}
      </h1>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {panel.gold.isGold && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#131410] px-3 py-1.5 text-[11px] font-bold tracking-[0.12em] text-[#c9b989] uppercase">
            <Crown className="size-[13px]" strokeWidth={2.25} />
            {strings.gold}
          </span>
        )}
        {panel.isStudent && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black px-3 py-1.5 text-[11px] font-bold tracking-[0.12em] text-sage uppercase">
            <GraduationCap className="size-[13px]" strokeWidth={2.25} />
            {strings.student}
          </span>
        )}
        {panel.isStudent && (
          <span
            className={
              panel.studentVerified
                ? "inline-flex items-center gap-1.5 rounded-full border border-sage px-3 py-1.5 text-[11px] font-semibold text-sage-deep"
                : "inline-flex items-center gap-1.5 rounded-full bg-cream px-3 py-1.5 text-[11px] font-semibold text-muted"
            }
          >
            {panel.studentVerified && (
              <BadgeCheck className="size-[13px]" strokeWidth={2.25} />
            )}
            {panel.studentVerified ? strings.verified : strings.toVerify}
          </span>
        )}
      </div>

      <p className="mt-2 flex items-center gap-3 text-[12.5px] text-muted">
        {panel.passSerial}
        {/* Spec §6.4: member lost the card link -> barista reopens it here. */}
        <a
          href={`/card/${panel.memberId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-sage-deep"
        >
          <ExternalLink className="size-[13px]" strokeWidth={2.25} />
          {strings.openCard}
        </a>
      </p>

      <section className="mt-4 rounded-card border-[1.5px] border-sage p-5">
        <StampRow filled={filled} total={panel.cycleLength} />
        <p className="text-center text-[13px] font-semibold text-ink">
          {panel.progress >= panel.cycleLength
            ? strings.full(panel.cycleLength)
            : strings.progress(panel.progress, panel.cycleLength)}
        </p>
        <p className="mt-1 text-center text-[12px] text-muted">
          {strings.total(panel.totalStamps)}
        </p>
        {panel.gold.isGold && panel.gold.expiresAt && (
          <p className="mt-2 text-center text-[12px] font-semibold text-[#8a7c52]">
            {strings.goldUntil(formatBucharestDateTime(panel.gold.expiresAt))}
          </p>
        )}
        {!panel.gold.isGold && panel.gold.downgradedAt && (
          <p className="mt-2 text-center text-[12px] text-muted">
            {strings.goldLost(
              formatBucharestDate(panel.gold.downgradedAt),
              panel.gold.cardsRequired,
            )}
          </p>
        )}
        {/* The rotating Gold perk: what this fortnight gives, and whether it
            is still on the table. Redeeming it is a button further down. */}
        {panel.perk && (
          <p className="mt-2 text-center text-[12px] text-[#8a7c52]">
            {panel.perk.usedAt
              ? strings.perkUsed(
                  panel.perk.name,
                  formatBucharestDate(panel.perk.usedAt),
                )
              : `${strings.perkReady(panel.perk.name)} ${strings.perkUntil(
                  formatBucharestDate(panel.perk.endsAt),
                )}`}
            {panel.perk.toGoOnly && ` ${strings.toGoOnly}.`}
          </p>
        )}
      </section>

      {/* The info notice already carries the time; do not say it twice. */}
      {panel.blockedUntil && notice?.tone !== "info" && (
        <p className="mt-3 rounded-card bg-cream px-4 py-3 text-[12.5px] text-muted">
          {strings.blocked(formatBucharestTime(panel.blockedUntil))}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2.5">
        {/* One calm line instead of the earn/redeem buttons: a blocked card
            must not look like a working one with disabled controls. */}
        {blocked && panel.blockedAt && (
          <p className="flex items-start gap-2.5 rounded-card bg-cream p-4 text-[13px] font-semibold text-ink">
            <Ban
              className="mt-px size-[17px] shrink-0 text-muted"
              strokeWidth={2}
            />
            {strings.blockedLine(formatBucharestDate(panel.blockedAt))}
          </p>
        )}

        {!blocked && (
        <button
          type="button"
          onClick={() => act(onAddStamp)}
          disabled={busy}
          className={`${primary} bg-ink text-paper`}
        >
          {pending?.type === "stamp" ? (
            <Loader2 className="size-[18px] animate-spin" strokeWidth={2} />
          ) : (
            <Stamp className="size-[18px]" strokeWidth={2} />
          )}
          {double ? strings.addStampDouble : strings.addStamp}
        </button>
        )}

        {!blocked && double && (
          <p className="text-center text-[12.5px] font-semibold text-sage-deep">
            {strings.doubleHint(panel.doubleWindowLabel)}
          </p>
        )}

        {!blocked && panel.rewards.map((reward) => (
          <button
            key={reward.id}
            type="button"
            onClick={() => pressRedeem(reward)}
            disabled={busy}
            className={
              confirming === reward.id
                ? `${primary} flex-col gap-1 border-[1.5px] border-olive bg-olive text-paper`
                : `${primary} flex-col gap-1 border-[1.5px] border-sage bg-sage text-olive`
            }
          >
            <span className="flex items-center gap-2">
              {pending?.type === "redeem" && pending.rewardId === reward.id ? (
                <Loader2 className="size-[18px] animate-spin" strokeWidth={2} />
              ) : (
                <Gift className="size-[18px]" strokeWidth={2} />
              )}
              {confirming === reward.id
                ? strings.confirmToGo
                : strings.redeem(reward.name)}
            </span>
            {reward.toGoOnly && confirming !== reward.id && (
              <span className="text-[11px] font-bold tracking-[0.1em] text-olive/70 uppercase">
                {strings.toGoOnly}
              </span>
            )}
          </button>
        ))}

        {/* The cap sits with the redeem buttons: it is a rule about what the
            barista may hand over, not a member stat. */}
        {!blocked && panel.rewards.length > 0 && panel.rewardValueCapLabel && (
          <p className="text-center text-[12px] font-semibold text-muted">
            {strings.capLine(panel.rewardValueCapLabel)}
          </p>
        )}

        {!blocked && !panel.reviewBonusGiven && (
          <button
            type="button"
            onClick={() => act(onReviewBonus)}
            disabled={busy}
            className={secondary}
          >
            {pending?.type === "review" ? (
              <Loader2 className="size-[17px] animate-spin" strokeWidth={2} />
            ) : (
              <MessageSquareQuote
                className="size-[17px] text-sage-deep"
                strokeWidth={2}
              />
            )}
            {strings.reviewBonus}
          </button>
        )}

        {!blocked && showStudentVerify && (
          <button
            type="button"
            onClick={() => act(onVerifyStudent)}
            disabled={busy}
            className={secondary}
          >
            {pending?.type === "student" ? (
              <Loader2 className="size-[17px] animate-spin" strokeWidth={2} />
            ) : (
              <BadgeCheck
                className="size-[17px] text-sage-deep"
                strokeWidth={2}
              />
            )}
            {strings.verifyStudent}
          </button>
        )}

        {/* Card control — manager only, and always a second press away: a
            blocked customer or a dead QR is not something to trigger by
            accident between two lattes. */}
        {manager && (
          <>
            <button
              type="button"
              onClick={() =>
                pressControl(blocked ? "unblock" : "block", () =>
                  onSetBlocked(!blocked),
                )
              }
              disabled={busy}
              className={
                confirming === "block" || confirming === "unblock"
                  ? `${secondary} border-olive text-olive`
                  : secondary
              }
            >
              {pending?.type === "block" ? (
                <Loader2 className="size-[17px] animate-spin" strokeWidth={2} />
              ) : blocked ? (
                <LockOpen className="size-[17px] text-sage-deep" strokeWidth={2} />
              ) : (
                <Ban className="size-[17px] text-muted" strokeWidth={2} />
              )}
              {confirming === "block"
                ? strings.confirmBlock
                : confirming === "unblock"
                  ? strings.confirmUnblock
                  : blocked
                    ? strings.unblock
                    : strings.block}
            </button>

            <button
              type="button"
              onClick={() => pressControl("reissue", onReissue)}
              disabled={busy}
              className={
                confirming === "reissue"
                  ? `${secondary} border-olive text-olive`
                  : secondary
              }
            >
              {pending?.type === "reissue" ? (
                <Loader2 className="size-[17px] animate-spin" strokeWidth={2} />
              ) : (
                <QrCode className="size-[17px] text-sage-deep" strokeWidth={2} />
              )}
              {confirming === "reissue" ? strings.confirmReissue : strings.reissue}
            </button>

            {/* GDPR, on the member's request: withdraw the promo consent or
                erase the person entirely. Same two-step as the card controls
                above — the second one especially has no way back. */}
            {panel.marketingConsentAt !== null && (
              <button
                type="button"
                onClick={() => pressControl("marketing", onWithdrawMarketing)}
                disabled={busy}
                className={
                  confirming === "marketing"
                    ? `${secondary} border-olive text-olive`
                    : secondary
                }
              >
                {pending?.type === "marketing" ? (
                  <Loader2 className="size-[17px] animate-spin" strokeWidth={2} />
                ) : (
                  <BellOff className="size-[17px] text-muted" strokeWidth={2} />
                )}
                {confirming === "marketing"
                  ? strings.confirmWithdrawMarketing
                  : strings.withdrawMarketing}
              </button>
            )}

            <button
              type="button"
              onClick={() => pressControl("forget", onForget)}
              disabled={busy}
              className={
                confirming === "forget"
                  ? `${secondary} border-olive text-olive`
                  : secondary
              }
            >
              {pending?.type === "forget" ? (
                <Loader2 className="size-[17px] animate-spin" strokeWidth={2} />
              ) : (
                <UserX className="size-[17px] text-muted" strokeWidth={2} />
              )}
              {confirming === "forget" ? strings.confirmForget : strings.forget}
            </button>
          </>
        )}

        {/* The dispute trail ("dar aveam 4 ștampile"): collapsed behind a
            quiet toggle so it never competes with the buttons above. */}
        {panel.history.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setHistoryOpen((open) => !open)}
              className="mt-1 flex w-full items-center justify-center gap-2 p-2 text-[13px] font-semibold text-muted"
            >
              <History className="size-4" strokeWidth={2} />
              {strings.history}
              {historyOpen ? (
                <ChevronUp className="size-4" strokeWidth={2} />
              ) : (
                <ChevronDown className="size-4" strokeWidth={2} />
              )}
            </button>
            {historyOpen && (
              <div className="rounded-card border border-line">
                {panel.history.map((entry, index) => (
                  <div
                    key={`${entry.at}-${index}`}
                    className={`px-4 py-2.5 ${index > 0 ? "border-t border-line" : ""}`}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[12.5px] font-semibold text-ink">
                        {entry.label}
                      </span>
                      <span className="shrink-0 text-[11.5px] text-muted tabular-nums">
                        {formatBucharestDateTime(entry.at)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-muted">
                      {entry.locationName}
                      {entry.staffName && ` · ${entry.staffName}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <button
          type="button"
          onClick={() => act(onReset)}
          disabled={busy}
          className="mt-1 flex w-full items-center justify-center gap-2 p-2 text-[13px] font-semibold text-muted disabled:opacity-45"
        >
          <RotateCcw className="size-4" strokeWidth={2} />
          {strings.reset}
        </button>
      </div>
    </div>
  );
}
