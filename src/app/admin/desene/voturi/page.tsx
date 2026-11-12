import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Trophy, TriangleAlert } from "lucide-react";
import AdminBar from "@/components/admin/AdminBar";
import PhoneFrame from "@/components/PhoneFrame";
import { readStaffSession } from "@/lib/admin/session";
import { loadVoteBoard } from "@/lib/admin/vote-board";
import { canSelectWinners } from "@/lib/campaign-phase";
import { getDb } from "@/lib/db";
import {
  CUP_WINNERS_TOTAL,
  DRAWING_CATEGORIES,
  VOTE_CLOSES_LABEL,
  VOTE_WINNERS_PER_CATEGORY,
} from "@/lib/drawing";
import { BURST_THRESHOLD, burstIsSuspicious } from "@/lib/drawing-vote";
import VoteWinnerButton from "./VoteWinnerButton";

export const metadata: Metadata = {
  title: "Voturi desene · Origins",
  robots: { index: false, follow: false },
};

/**
 * The ONLY screen where vote counts exist for a human: manager role,
 * re-checked here. Per age group: votes, days online, votes per day (the
 * number that decides), an alarm for bursts of first-time e-mails, and the
 * button that marks the public-vote winner. Nothing is decided by the
 * code: ties and flagged drawings are the manager's call.
 */

/** Staff screen: Romanian only. */
const strings = {
  back: "Înapoi la desene",
  eyebrow: "Origins · concurs de desene",
  title: "Votul public",
  introOpen: `Votul e deschis până pe ${VOTE_CLOSES_LABEL}. Cifrele de aici le vede doar managerul: publicul nu vede niciun număr și niciun clasament.`,
  introClosed: `Votul s-a încheiat pe ${VOTE_CLOSES_LABEL}. Clasamentul de mai jos e cel final.`,
  rule: "Câștigă desenul cu cele mai multe voturi pe zi din grupa lui: voturi împărțite la zilele de când e online (minimum o zi). Așa un desen publicat târziu nu pleacă cu handicap.",
  summary: "Cele zece desene",
  byVote: "Vot public",
  byJury: "Juriu",
  total: "Total",
  years: "ani",
  votes: (n: number) => (n === 1 ? "1 vot" : n % 100 >= 1 && n % 100 <= 19 ? `${n} voturi` : `${n} de voturi`),
  daysOnline: "zile online",
  perDay: "voturi pe zi",
  empty: "Niciun desen online în grupa asta.",
  winner: "Câștigător vot public",
  juryPick: "Ales de juriu",
  noReproduction: "Fără acord de reproducere: nu poate ajunge pe pahar",
  tie: "Egalitate la voturi pe zi. Codul nu alege: decizia e a organizatorului.",
  burst: (n: number) =>
    `${n} voturi de la adrese noi în 30 de minute. Verifică înainte să decizi; nu se șterge nimic automat.`,
  juryWarn: (category: string, have: number, want: number) =>
    `Juriu ${category} ani: ${have} din ${want}.`,
  voteWarn: (category: string) => `Vot public ${category} ani: niciun câștigător marcat.`,
  jurySelectHint:
    "Alegerile juriului se marchează din lista de desene, cu starea „Selectat”. Câștigătorii votului se stabilesc primii; juriul alege din restul.",
  export: "Exportă voturile (CSV)",
  exportNote: `Fișierul are codul desenului, grupa, momentul votului și amprenta adresei de e-mail. Adresele nu sunt salvate nicăieri. Pragul de alarmă: ${BURST_THRESHOLD} adrese noi în 30 de minute.`,
};

const decimal = (value: number, digits: number) =>
  value.toLocaleString("ro-RO", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export default async function VoturiPage() {
  const session = await readStaffSession();
  if (!session) redirect("/admin");
  if (session.role !== "manager") redirect("/admin/desene");

  // The numbers come from one place for both panels (lib/admin/vote-board.ts).
  const [cafenea, board] = await Promise.all([
    getDb().getLocationBySlug(session.locationSlug),
    loadVoteBoard(),
  ]);
  const { ranked, byId, bursts, perCategory, totalVote, totalJury, open } = board;
  // Vote winners are marked only after the vote closed (lib/campaign-phase.ts).
  const selecting = canSelectWinners(board.phase);
  const warnings = board.missing.map((item) =>
    item.kind === "vote"
      ? strings.voteWarn(item.category)
      : strings.juryWarn(item.category, item.have, item.want),
  );

  return (
    <PhoneFrame>
      <AdminBar locationName={cafenea?.name ?? session.locationSlug} role={session.role} />

      <div className="px-5 pt-[22px] pb-1.5">
        <Link
          href="/admin/desene"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-sage-deep"
        >
          <ArrowLeft className="size-[14px]" strokeWidth={2.25} />
          {strings.back}
        </Link>
        <div className="mt-3 text-[11px] font-bold tracking-[0.18em] text-sage-deep uppercase">
          {strings.eyebrow}
        </div>
        <h1 className="mt-1 mb-2 text-[30px] font-extrabold tracking-[-0.02em]">
          {strings.title}
        </h1>
        <p className="text-[13.5px] leading-[1.5] text-ink/72">
          {open ? strings.introOpen : strings.introClosed}
        </p>
        <p className="mt-2 text-[12.5px] leading-[1.5] text-muted">{strings.rule}</p>
      </div>

      <div className="flex flex-col gap-5 px-5 pt-4 pb-8">
        <section className="rounded-card border border-line p-4" data-section="rezumat">
          <h2 className="text-[10.5px] font-bold tracking-[0.16em] text-sage-deep uppercase">
            {strings.summary}
          </h2>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 gap-y-1.5 text-[12.5px]">
            <span />
            <span className="text-right text-muted">{strings.byVote}</span>
            <span className="text-right text-muted">{strings.byJury}</span>
            {perCategory.map((row) => (
              <div key={row.category} className="contents">
                <span className="text-ink/72">
                  {row.category} {strings.years}
                </span>
                <span className="text-right font-bold tabular-nums">
                  {row.voteWinners} / {VOTE_WINNERS_PER_CATEGORY}
                </span>
                <span className="text-right font-bold tabular-nums">
                  {row.juryPicks} / {row.juryWanted}
                </span>
              </div>
            ))}
            <span className="border-t border-line pt-1.5 font-semibold">{strings.total}</span>
            <span className="border-t border-line pt-1.5 text-right font-bold tabular-nums">
              {totalVote}
            </span>
            <span className="border-t border-line pt-1.5 text-right font-bold tabular-nums">
              {totalJury}
            </span>
          </div>
          <div className="mt-2 text-[13px] font-semibold text-ink">
            {totalVote} + {totalJury} = {totalVote + totalJury} / {CUP_WINNERS_TOTAL}
          </div>
          {warnings.length > 0 && (
            <ul className="mt-2.5 flex flex-col gap-1 rounded-card bg-cream px-3.5 py-2.5 text-[12.5px] text-ink/80">
              {warnings.map((warning) => (
                <li key={warning} className="flex items-start gap-2">
                  <TriangleAlert
                    className="mt-[2px] size-[13px] shrink-0 text-sage-deep"
                    strokeWidth={2}
                  />
                  {warning}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2.5 text-[12px] leading-[1.5] text-muted">{strings.jurySelectHint}</p>
        </section>

        {DRAWING_CATEGORIES.map((category) => {
          const rows = ranked[category];
          const topTied = rows.length > 0 && rows[0].tied && rows[0].votes > 0;
          return (
            <section key={category} data-category={category}>
              <h2 className="text-[11px] font-bold tracking-[0.16em] text-sage-deep uppercase">
                {category} {strings.years}
              </h2>
              {topTied && (
                <p className="mt-2 flex items-start gap-2 rounded-card bg-cream px-3.5 py-2.5 text-[12.5px] font-semibold text-ink">
                  <TriangleAlert
                    className="mt-px size-[15px] shrink-0 text-sage-deep"
                    strokeWidth={2}
                  />
                  {strings.tie}
                </p>
              )}
              <div className="mt-2 rounded-card border border-line">
                {rows.length === 0 && (
                  <p className="px-4 py-3.5 text-[12.5px] text-muted">{strings.empty}</p>
                )}
                {rows.map((row, index) => {
                  const entry = byId.get(row.id)!;
                  const burst = bursts.get(row.id) ?? 0;
                  return (
                    <div
                      key={row.id}
                      data-code={row.code}
                      className={`px-4 py-3.5 ${index === 0 ? "" : "border-t border-line"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/admin/desene/${row.id}`}
                            className="text-[17px] leading-none font-extrabold tracking-[-0.01em] tabular-nums"
                          >
                            <span className="mr-2 text-muted">{row.position}.</span>
                            {row.code}
                          </Link>
                          <div className="mt-1.5 truncate text-[13px] font-semibold text-ink">
                            {entry.childFirstName}, {entry.childAge} {strings.years}
                          </div>
                          <div className="mt-0.5 text-[11.5px] text-muted" data-cell="detalii">
                            {strings.votes(row.votes)} · {decimal(row.daysOnline, 1)}{" "}
                            {strings.daysOnline}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div
                            className="text-[20px] leading-none font-extrabold tabular-nums"
                            data-cell="pe-zi"
                          >
                            {decimal(row.votesPerDay, 2)}
                          </div>
                          <div className="mt-1 text-[10.5px] text-muted">{strings.perDay}</div>
                        </div>
                      </div>

                      {entry.winnerKind !== null && (
                        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-sage px-2.5 py-1 text-[11px] font-semibold text-olive">
                          <Trophy className="size-[12px]" strokeWidth={2.25} />
                          {entry.winnerKind === "vote" ? strings.winner : strings.juryPick}
                        </div>
                      )}
                      {burstIsSuspicious(burst) && (
                        <p
                          data-flag="rafala"
                          className="mt-2 flex items-start gap-2 rounded-card bg-cream px-3.5 py-2.5 text-[12.5px] font-semibold text-ink"
                        >
                          <TriangleAlert
                            className="mt-px size-[15px] shrink-0 text-sage-deep"
                            strokeWidth={2}
                          />
                          {strings.burst(burst)}
                        </p>
                      )}

                      {selecting && entry.winnerKind !== "jury" && entry.status !== "selectat" && (
                        <VoteWinnerButton entryId={row.id} winner={entry.voteWinner} />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        <section className="flex flex-col gap-2">
          <form method="post" action="/admin/desene/voturi/export">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-btn border border-line bg-paper p-[13px] text-[14px] font-semibold text-ink"
            >
              {strings.export}
            </button>
          </form>
          <p className="text-[12px] leading-[1.5] text-muted">{strings.exportNote}</p>
        </section>
      </div>
    </PhoneFrame>
  );
}
