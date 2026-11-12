import type { DrawingEntry } from "./db/index.ts";
import {
  DRAWING_CATEGORIES,
  drawingIsLive,
  publicDrawing,
  type DrawingCategory,
  type PublicDrawing,
} from "./drawing.ts";

/**
 * The public results (regulament art. 10.4): per age group, the public-vote
 * winner and the jury picks, ONLY those whose parent accepted the prize
 * (`winnerAcceptedAt`) and that are live in the online gallery (gallery
 * consent, published, not taken down). A winner without gallery consent is
 * announced in the cafés, never on the site.
 *
 * Built through `publicDrawing`, so nothing private can leak: no parent, no
 * phone, no café, no count, no rank, no id. Whether the page shows this at
 * all is the phase's business (lib/campaign-guards.ts `resultsVisible`).
 */
export type PublicResults = Record<
  DrawingCategory,
  { vote: PublicDrawing | null; jury: PublicDrawing[] }
>;

export function publicResults(entries: DrawingEntry[]): PublicResults {
  const shown = entries.filter(
    (entry) =>
      entry.winnerKind !== null &&
      entry.winnerAcceptedAt !== null &&
      entry.consentGallery &&
      drawingIsLive(entry),
  );
  const result = {} as PublicResults;
  for (const category of DRAWING_CATEGORIES) {
    const inCategory = shown
      .filter((entry) => entry.category === category)
      .sort((a, b) => a.code.localeCompare(b.code));
    const voteEntry = inCategory.find((entry) => entry.winnerKind === "vote");
    result[category] = {
      vote: voteEntry ? publicDrawing(voteEntry) : null,
      jury: inCategory
        .filter((entry) => entry.winnerKind === "jury")
        .map((entry) => publicDrawing(entry))
        .filter((drawing): drawing is PublicDrawing => drawing !== null),
    };
  }
  return result;
}
