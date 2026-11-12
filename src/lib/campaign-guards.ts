import {
  CAMPAIGN_INSTANTS,
  CAMPAIGN_PHASES,
  canConfirmCollection,
  canPreregister,
  canPublishResults,
  canPublishToGallery,
  canSelectWinners,
  canSubmitAtCafe,
  canVote,
  type CampaignPhase,
} from "./campaign-phase.ts";
import { campaignPrintable, type SheetKind, type WinnerKind } from "./db/campaign-rules.ts";
import {
  CUP_WINNERS_TOTAL,
  drawingIsLive,
  type DrawingCategory,
  type DrawingStatus,
} from "./drawing.ts";

/**
 * The decisions every campaign server function makes before it touches the
 * store, as pure functions: phase in, refusal code out (null = go ahead).
 * The server functions (app/desen, app/desene, app/admin/desene) compute
 * the phase with `campaignPhase(campaignNow(), state)` and ask here, so the
 * rules are tested without Next, cookies or a database.
 *
 * Two refusal words for the calendar, on every action:
 *   not_open  too early: the phase that allows it has not started
 *   closed    too late: the phase that allowed it is over
 */

export type PhaseRefusal = "not_open" | "closed";

const order = (phase: CampaignPhase) => CAMPAIGN_PHASES.indexOf(phase);

/** Earlier than every allowed phase = not_open; anything else = closed. */
function refusal(phase: CampaignPhase, allowed: (p: CampaignPhase) => boolean): PhaseRefusal | null {
  if (allowed(phase)) return null;
  const first = CAMPAIGN_PHASES.find(allowed);
  return first !== undefined && order(phase) < order(first) ? "not_open" : "closed";
}

/** Public preregistration (/desen). */
export const preregistrationRefusal = (phase: CampaignPhase) => refusal(phase, canPreregister);

/** Staff: walk-in registration at the café and "predat în cafenea". */
export const cafeSubmissionRefusal = (phase: CampaignPhase) => refusal(phase, canSubmitAtCafe);

/** Staff: putting a drawing online (runs until the vote closes). */
export const publishRefusal = (phase: CampaignPhase) => refusal(phase, canPublishToGallery);

/** Public: vote code request, code confirmation, one-tap vote. */
export const voteRefusal = (phase: CampaignPhase) => refusal(phase, canVote);

/** Manager: vote winners, jury picks, reserves, acceptance. */
export const selectionRefusal = (phase: CampaignPhase) => refusal(phase, canSelectWinners);

/**
 * Manager: "Publică rezultatele". Inside `voting_closed` but before
 * 06.12 00:00 it is still too early; once published it is closed.
 */
export function publishResultsRefusal(now: Date, phase: CampaignPhase): PhaseRefusal | null {
  if (canPublishResults(now, phase)) return null;
  return order(phase) <= order("voting_closed") ? "not_open" : "closed";
}

/** Manager: "Paharele au ajuns". Only once the results are public, only once. */
export const collectionRefusal = (phase: CampaignPhase) => refusal(phase, canConfirmCollection);

/** The public results may be shown (and only accepted winners, see campaign-results.ts). */
export function resultsVisible(phase: CampaignPhase): boolean {
  return phase === "results" || phase === "collection";
}

/* ------------------------------------------------------------ the vote --- */

export type VoteTargetRefusal = PhaseRefusal | "gone" | "not_votable";

/**
 * Whether this drawing can take a vote right now, in this order: the
 * calendar, then online, then printable. A gallery-only drawing (no
 * reproduction consent, or drawn on other paper) can never win a cup, so
 * it never takes a vote (regulament art. 9^1.2).
 */
export function voteTargetRefusal(
  entry:
    | {
        publishedAt: string | null;
        unpublishedAt: string | null;
        consentReproduction: boolean;
        sheetKind?: SheetKind | null;
      }
    | null,
  phase: CampaignPhase,
): VoteTargetRefusal | null {
  const calendar = voteRefusal(phase);
  if (calendar) return calendar;
  if (!entry || !drawingIsLive(entry)) return "gone";
  if (!campaignPrintable(entry)) return "not_votable";
  return null;
}

/* ----------------------------------------------------------- selection --- */

/** What the selection rules need to know about a drawing. */
export interface SelectionEntry {
  id: string;
  category: DrawingCategory;
  status: DrawingStatus;
  consentReproduction: boolean;
  sheetKind: SheetKind | null;
  submittedAt: string | null;
  publishedAt: string | null;
  unpublishedAt: string | null;
  winnerKind: WinnerKind | null;
}

/** Handed in at a café: recorded through "predat" or the old "depus" step. */
export function physicallySubmitted(entry: {
  submittedAt: string | null;
  status: DrawingStatus;
}): boolean {
  return entry.submittedAt !== null || entry.status !== "inregistrat";
}

/** Could win the public vote of its category: online and printable. */
export function voteCandidate(entry: SelectionEntry): boolean {
  return drawingIsLive(entry) && campaignPrintable(entry);
}

export type JuryPickRefusal =
  | "not_submitted"
  | "not_eligible"
  | "returned"
  | "is_vote_winner"
  | "vote_first"
  | "full";

/**
 * A jury pick (regulament art. 9.5, 9^1.1, 9^1.9):
 *   - the sheet and the signed form are in a café, the drawing is printable
 *     (official sheet + reproduction consent) and not handed back;
 *   - never the vote winner;
 *   - the vote winner of the category is validated FIRST. Exception: a
 *     category with no drawing that could win the vote (nothing online and
 *     printable) has its vote place chosen by the jury, so nothing waits;
 *   - ten cups in total: per-category numbers can move (art. 7.2), the total
 *     cannot.
 */
export function juryPickRefusal(
  entry: SelectionEntry,
  all: SelectionEntry[],
): JuryPickRefusal | null {
  if (entry.winnerKind === "jury") return null;
  if (entry.winnerKind === "vote") return "is_vote_winner";
  if (entry.status === "returnat") return "returned";
  if (!physicallySubmitted(entry)) return "not_submitted";
  if (!campaignPrintable(entry)) return "not_eligible";
  const sameCategory = all.filter((e) => e.category === entry.category);
  const voteDecided = sameCategory.some((e) => e.winnerKind === "vote");
  const voteRunnable = sameCategory.some(voteCandidate);
  if (!voteDecided && voteRunnable) return "vote_first";
  const winners = all.filter((e) => e.winnerKind !== null && e.id !== entry.id).length;
  if (winners >= CUP_WINNERS_TOTAL) return "full";
  return null;
}

export type ReserveRefusal = "not_submitted" | "not_eligible" | "returned" | "is_winner";

/** A reserve code: a printable, handed-in drawing that is not already a winner. */
export function reserveRefusal(entry: SelectionEntry): ReserveRefusal | null {
  if (entry.winnerKind !== null) return "is_winner";
  if (entry.status === "returnat") return "returned";
  if (!physicallySubmitted(entry)) return "not_submitted";
  if (!campaignPrintable(entry)) return "not_eligible";
  return null;
}

/* ------------------------------------------------------------ calendar --- */

/** The next date the admin should know about, for the bar at the top. */
export function nextCampaignStep(
  phase: CampaignPhase,
  now: Date,
): { label: string; at: string | null } {
  switch (phase) {
    case "before_open":
      return { label: "Pornesc preînregistrarea și depunerile", at: CAMPAIGN_INSTANTS.opensAt };
    case "submissions_open":
      return { label: "Ultima zi de depunere: 01.12, până la închidere", at: CAMPAIGN_INSTANTS.submissionsCloseAt };
    case "voting_only":
      return { label: "Votul se închide pe 03.12, la 23:59", at: CAMPAIGN_INSTANTS.voteClosesAt };
    case "voting_closed":
      return now.getTime() < new Date(CAMPAIGN_INSTANTS.announceFrom).getTime()
        ? { label: "Selecția pe 04.12, acceptarea până pe 05.12 la 20:00, rezultatele din 06.12", at: CAMPAIGN_INSTANTS.announceFrom }
        : { label: "Rezultatele se pot publica de acum", at: null };
    case "results":
      return { label: "Ridicarea pornește când paharele ajung în cafenele", at: null };
    case "collection":
      return { label: "Ridicarea paharelor e deschisă", at: null };
  }
}

export const PHASE_LABEL: Record<CampaignPhase, string> = {
  before_open: "Concursul nu a început",
  submissions_open: "Depuneri și vot deschise",
  voting_only: "Depunerile s-au încheiat, votul continuă",
  voting_closed: "Votul s-a încheiat: selecția",
  results: "Rezultatele sunt publice",
  collection: "Ridicarea paharelor",
};

/** Sheet kinds as a button says them, and inside a sentence. */
export const SHEET_KIND_LABEL: Record<SheetKind, string> = {
  oficiala: "Foaia oficială",
  colorat: "Foaia de colorat",
  "alta-foaie": "Altă foaie",
};
export const SHEET_KIND_PHRASE: Record<SheetKind, string> = {
  oficiala: "foaia oficială",
  colorat: "foaia de colorat",
  "alta-foaie": "altă foaie",
};
