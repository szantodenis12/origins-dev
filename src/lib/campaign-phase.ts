/**
 * The campaign calendar and its phases: ONE source for the public pages,
 * the server functions, the admin and the tests. Pure, no I/O.
 *
 * Every instant is a Bucharest wall-clock moment converted to UTC (DST
 * included) and written out literally, so a test can check it against
 * `bucharestInstant` and nobody has to trust a library at runtime.
 *
 * Calendar (proposal 10.11.2026, the dates marked * still need Roland /
 * the supplier):
 *
 *   16.11 00:00            online preregistration + café submissions open
 *   rolling                each handed-in drawing online within ~24 h; its
 *                          vote opens the moment it is published
 *   01.12 (café closing)   last day to hand in the drawing + signed form
 *   02.12 – 03.12          jury: PRELIMINARY scoring only (no picks)
 *   03.12 23:59            public vote closes
 *   04.12                  final selection: the 3 vote winners are validated
 *                          first, then the jury picks 7 (+ reserves) from the
 *                          remaining printable drawings using its scores;
 *                          winners are phoned privately
 *   05.12 20:00 *          acceptance deadline (reserve takes the place after)
 *   06.12 *                public announcement (Moș Nicolae), accepted
 *                          winners only
 *   07.12 *                files to the cup supplier (first working day)
 *   ~17.12 *               cups delivered — 10 days, supplier to confirm
 *   18.12 *                collection, ONLY once a manager confirms the cups
 *                          are in the café (never switched on by date alone)
 *
 * The two manual switches (results published, collection available) are
 * stored state (`CampaignState`), not dates: a date can arrive while the
 * cups have not.
 */

export type CampaignPhase =
  /** Before 16.11: nothing can be submitted, the page explains what comes. */
  | "before_open"
  /** Preregistration, café submissions, publishing and voting all open. */
  | "submissions_open"
  /** No more drawings; late ones are still being published; vote open. */
  | "voting_only"
  /** Vote over, selection running, nothing public about winners yet. */
  | "voting_closed"
  /** A manager published the results (not before the announcement day). */
  | "results"
  /** A manager confirmed the cups are in the cafés. */
  | "collection";

export const CAMPAIGN_PHASES: CampaignPhase[] = [
  "before_open",
  "submissions_open",
  "voting_only",
  "voting_closed",
  "results",
  "collection",
];

/** Exact instants (UTC) of the Bucharest wall-clock boundaries. */
export const CAMPAIGN_INSTANTS = {
  /** 16.11.2026 00:00 Bucharest (EET, UTC+2). */
  opensAt: "2026-11-15T22:00:00.000Z",
  /** 02.12.2026 00:00 Bucharest: the end of 01.12, last submission day. */
  submissionsCloseAt: "2026-12-01T22:00:00.000Z",
  /** 04.12.2026 00:00 Bucharest: the end of the minute 03.12 23:59. */
  voteClosesAt: "2026-12-03T22:00:00.000Z",
  /** 06.12.2026 00:00 Bucharest: results cannot be published earlier. */
  announceFrom: "2026-12-05T22:00:00.000Z",
} as const;

/** Human labels, Romanian, for copy and admin. Dates DD.MM.YYYY. */
export const CAMPAIGN_DATES = {
  opens: "16.11.2026",
  submissionsLastDay: "01.12.2026",
  juryPreliminary: "02–03.12.2026",
  voteCloses: "03.12.2026, ora 23:59",
  finalSelection: "04.12.2026",
  acceptanceDeadline: "05.12.2026, ora 20:00",
  announcement: "06.12.2026",
  filesToSupplier: "07.12.2026",
  /** Supplier-dependent: always say "estimat" / "după confirmarea furnizorului". */
  collectionEstimate: "18.12.2026",
} as const;

/** The manual switches, stored by the adapter (singleton row). */
export interface CampaignState {
  /** Set by a manager on/after `announceFrom`; null until then. */
  resultsPublishedAt: string | null;
  /** Set by a manager once the cups are physically in the cafés. */
  collectionConfirmedAt: string | null;
}

export const EMPTY_CAMPAIGN_STATE: CampaignState = {
  resultsPublishedAt: null,
  collectionConfirmedAt: null,
};

const t = (iso: string) => new Date(iso).getTime();

export function campaignPhase(
  now: Date,
  state: CampaignState = EMPTY_CAMPAIGN_STATE,
): CampaignPhase {
  const ms = now.getTime();
  if (ms < t(CAMPAIGN_INSTANTS.opensAt)) return "before_open";
  if (ms < t(CAMPAIGN_INSTANTS.submissionsCloseAt)) return "submissions_open";
  if (ms < t(CAMPAIGN_INSTANTS.voteClosesAt)) return "voting_only";
  if (!state.resultsPublishedAt) return "voting_closed";
  if (!state.collectionConfirmedAt) return "results";
  return "collection";
}

/* ------------------------------------------------- what each phase allows --- */

/** Online preregistration (public form). */
export function canPreregister(phase: CampaignPhase): boolean {
  return phase === "submissions_open";
}

/** Staff recording a physical drawing + signed form at the café. */
export function canSubmitAtCafe(phase: CampaignPhase): boolean {
  return phase === "submissions_open";
}

/**
 * Staff putting a drawing online. Drawings handed in on the last day are
 * published on 02–03.12, so publishing runs until the vote closes.
 */
export function canPublishToGallery(phase: CampaignPhase): boolean {
  return phase === "submissions_open" || phase === "voting_only";
}

/** Requesting a vote code and casting a vote. */
export function canVote(phase: CampaignPhase): boolean {
  return phase === "submissions_open" || phase === "voting_only";
}

/**
 * Marking vote winners and jury picks (status "selectat"). Only after the
 * vote closed: the vote winners are decided first, the jury picks from the
 * rest, and no pick may exist while votes can still change the ranking.
 */
export function canSelectWinners(phase: CampaignPhase): boolean {
  return phase === "voting_closed" || phase === "results";
}

/** Manager publishing the results. */
export function canPublishResults(now: Date, phase: CampaignPhase): boolean {
  return phase === "voting_closed" && now.getTime() >= t(CAMPAIGN_INSTANTS.announceFrom);
}

/** Manager confirming the cups arrived. */
export function canConfirmCollection(phase: CampaignPhase): boolean {
  return phase === "results";
}

/* ------------------------------------------------------------ test clock --- */

/**
 * `CAMPAIGN_CLOCK=2026-12-02T10:00:00Z` moves the campaign clock in
 * development and tests, so every phase can be checked before it happens.
 * Ignored in production: there, the campaign always runs on real time.
 */
export function campaignNow(env: { NODE_ENV?: string; CAMPAIGN_CLOCK?: string } = {
  NODE_ENV: process.env.NODE_ENV,
  CAMPAIGN_CLOCK: process.env.CAMPAIGN_CLOCK,
}): Date {
  if (env.NODE_ENV !== "production" && env.CAMPAIGN_CLOCK) {
    const forced = new Date(env.CAMPAIGN_CLOCK);
    if (!Number.isNaN(forced.getTime())) return forced;
  }
  return new Date();
}
