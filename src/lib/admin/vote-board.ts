import "server-only";

import { getDb } from "../db";
import type { DrawingEntry } from "../db";
import {
  DRAWING_CATEGORIES,
  JURY_PICKS_PER_CATEGORY,
  VOTE_WINNERS_PER_CATEGORY,
  type DrawingCategory,
} from "../drawing";
import { rankByCategory, voteBursts, type RankedStanding } from "../drawing-vote";
import { canVote, type CampaignPhase } from "../campaign-phase";
import { campaignMoment } from "../campaign-server";
import { voteCandidate } from "../campaign-guards";

/**
 * Everything the manager's vote screen shows, computed once for both panels
 * (the Origins admin and the campaign panel): votes per drawing, the ranking
 * by votes per day in each age group, the burst alarm, and the 3 + 7 count.
 * MANAGER ONLY: callers check the role before calling. Nothing here may
 * reach a public page.
 */
export interface VoteBoard {
  open: boolean;
  phase: CampaignPhase;
  ranked: Record<DrawingCategory, RankedStanding[]>;
  byId: Map<string, DrawingEntry>;
  /** Largest burst of first-time e-mails per drawing (lib/drawing-vote.ts). */
  bursts: Map<string, number>;
  perCategory: {
    category: DrawingCategory;
    voteWinners: number;
    juryPicks: number;
    juryWanted: number;
  }[];
  totalVote: number;
  totalJury: number;
  /** Structured, so each panel words them itself. */
  missing: (
    | { kind: "vote"; category: DrawingCategory }
    | { kind: "jury"; category: DrawingCategory; have: number; want: number }
  )[];
}

export async function loadVoteBoard(): Promise<VoteBoard> {
  const db = getDb();
  const [entries, votes, moment] = await Promise.all([
    db.listDrawingEntries(),
    db.listDrawingVotes(),
    campaignMoment(),
  ]);

  const counts = new Map<string, number>();
  for (const vote of votes) {
    counts.set(vote.drawingId, (counts.get(vote.drawingId) ?? 0) + 1);
  }

  // Only drawings that can win the vote are ranked: online AND printable.
  // A gallery-only drawing takes no votes and never appears here.
  const ranked = rankByCategory(
    entries
      .filter((entry) => voteCandidate(entry))
      .map((entry) => ({
        id: entry.id,
        code: entry.code,
        category: entry.category,
        publishedAt: entry.publishedAt!,
        votes: counts.get(entry.id) ?? 0,
      })),
  );

  const perCategory = DRAWING_CATEGORIES.map((category) => {
    const inCategory = entries.filter((entry) => entry.category === category);
    return {
      category,
      voteWinners: inCategory.filter((entry) => entry.winnerKind === "vote").length,
      // The selection result is `winnerKind`, not the print ladder's "selectat".
      juryPicks: inCategory.filter((entry) => entry.winnerKind === "jury").length,
      juryWanted: JURY_PICKS_PER_CATEGORY[category],
    };
  });

  return {
    open: canVote(moment.phase),
    phase: moment.phase,
    ranked,
    byId: new Map(entries.map((entry) => [entry.id, entry])),
    bursts: voteBursts(votes),
    perCategory,
    totalVote: perCategory.reduce((sum, row) => sum + row.voteWinners, 0),
    totalJury: perCategory.reduce((sum, row) => sum + row.juryPicks, 0),
    missing: perCategory.flatMap((row) => [
      ...(row.voteWinners < VOTE_WINNERS_PER_CATEGORY
        ? [{ kind: "vote" as const, category: row.category }]
        : []),
      ...(row.juryPicks < row.juryWanted
        ? [{ kind: "jury" as const, category: row.category, have: row.juryPicks, want: row.juryWanted }]
        : []),
    ]),
  };
}
