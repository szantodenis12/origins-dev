import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, TriangleAlert, Trophy } from "lucide-react";
import { WinnerButton } from "@/components/campaign-admin/Rows";
import Shell from "@/components/campaign-admin/Shell";
import { BTN_QUIET, CHIP, NOTE } from "@/components/campaign-admin/ui";
import { readCampaignRole } from "@/lib/admin/drawing-access";
import { loadVoteBoard } from "@/lib/admin/vote-board";
import {
  CUP_WINNERS_TOTAL,
  DRAWING_CATEGORIES,
  VOTE_CLOSES_LABEL,
  VOTE_WINNERS_PER_CATEGORY,
} from "@/lib/drawing";
import { BURST_THRESHOLD, burstIsSuspicious } from "@/lib/drawing-vote";
import { canSelectWinners } from "@/lib/campaign-phase";

export const metadata: Metadata = {
  title: "Voturi · Panoul desenelor",
  robots: { index: false, follow: false },
};

/**
 * The only screen of the campaign panel where vote counts exist for a
 * human: MANAGER role, checked here on every request (staff are sent back
 * to the list). The numbers come from lib/admin/vote-board.ts, the same
 * source as the Origins admin's screen. Nothing is decided by the code:
 * ties and flagged drawings are the manager's call.
 */

const decimal = (value: number, digits: number) =>
  value.toLocaleString("ro-RO", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const votes = (n: number) =>
  n === 1 ? "1 vot" : n % 100 >= 1 && n % 100 <= 19 ? `${n} voturi` : `${n} de voturi`;

export default async function CampaignVotesPage() {
  const role = await readCampaignRole();
  if (!role) redirect("/admin");
  if (role !== "manager") redirect("/admin");

  const board = await loadVoteBoard();
  const { ranked, byId, bursts, perCategory, totalVote, totalJury, open } = board;
  const selecting = canSelectWinners(board.phase);
  const group = (category: string) => `${category.replace("-", "–")} ani`;

  return (
    <Shell role={role} active="voturi">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.02em]">Votul public</h1>
          <p className="mt-1.5 text-[15px] leading-[1.5] text-o-ink/70">
            {open
              ? `Votul e deschis până pe ${VOTE_CLOSES_LABEL}. Cifrele de aici le vede doar managerul: publicul nu vede niciun număr și niciun clasament.`
              : `Votul s-a încheiat pe ${VOTE_CLOSES_LABEL}. Clasamentul de mai jos e cel final.`}
          </p>
          <p className="mt-2 text-[14px] leading-[1.5] text-o-ink/60">
            Câștigă desenul cu cele mai multe voturi pe zi din grupa lui: voturi împărțite la zilele
            de când e online, minimum o zi. În clasament intră doar desenele care pot ajunge pe pahar
            (acord de reproducere, foaie oficială sau de colorat).
          </p>
        </div>

        <section className="rounded-3xl border border-o-ink/12 p-5" data-section="rezumat">
          <h2 className="text-[19px] font-bold">Cele zece desene</h2>
          <table className="mt-3 w-full text-[15px]">
            <thead>
              <tr className="text-left text-[13.5px] text-o-ink/60">
                <th className="pb-2 font-semibold">Grupa</th>
                <th className="pb-2 text-right font-semibold">Vot public</th>
                <th className="pb-2 text-right font-semibold">Juriu</th>
              </tr>
            </thead>
            <tbody>
              {perCategory.map((row) => (
                <tr key={row.category} className="border-t border-o-ink/10">
                  <td className="py-2.5">{group(row.category)}</td>
                  <td className="py-2.5 text-right font-bold tabular-nums">
                    {row.voteWinners} / {VOTE_WINNERS_PER_CATEGORY}
                  </td>
                  <td className="py-2.5 text-right font-bold tabular-nums">
                    {row.juryPicks} / {row.juryWanted}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 border-t border-o-ink/10 pt-3 text-[17px] font-bold tabular-nums">
            {totalVote} + {totalJury} = {totalVote + totalJury} / {CUP_WINNERS_TOTAL}
          </p>
          {board.missing.length > 0 && (
            <ul className={`${NOTE} mt-3 flex flex-col gap-1.5`}>
              {board.missing.map((item) => (
                <li key={`${item.kind}-${item.category}`} className="flex items-start gap-2">
                  <TriangleAlert className="mt-[3px] size-[15px] shrink-0" strokeWidth={1.75} />
                  {item.kind === "vote"
                    ? `Vot public ${group(item.category)}: niciun câștigător marcat.`
                    : `Juriu ${group(item.category)}: ${item.have} din ${item.want}.`}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[13.5px] leading-[1.5] text-o-ink/60">
            Câștigătorii votului se marchează aici, primii, după închiderea votului. Alegerile
            juriului, rezervele și acceptările se fac în{" "}
            <Link href="/admin/selectie" className="font-semibold underline underline-offset-2">
              Selecție
            </Link>
            .
          </p>
        </section>

        {DRAWING_CATEGORIES.map((category) => {
          const rows = ranked[category];
          const topTied = rows.length > 0 && rows[0].tied && rows[0].votes > 0;
          return (
            <section key={category} data-category={category}>
              <h2 className="text-[22px] font-extrabold tracking-[-0.01em]">{group(category)}</h2>
              {topTied && (
                <p className={`${NOTE} mt-2.5 flex items-start gap-2.5 font-semibold`}>
                  <TriangleAlert className="mt-0.5 size-[17px] shrink-0" strokeWidth={1.75} />
                  Egalitate la voturi pe zi. Codul nu alege: decizia e a organizatorului.
                </p>
              )}
              {rows.length === 0 ? (
                <p className="mt-2.5 rounded-3xl bg-o-wall px-5 py-6 text-[15px] text-o-ink/70">
                  Niciun desen online în grupa asta.
                </p>
              ) : (
                <ul className="mt-2.5 flex flex-col gap-3">
                  {rows.map((row) => {
                    const entry = byId.get(row.id)!;
                    const burst = bursts.get(row.id) ?? 0;
                    return (
                      <li key={row.id} data-code={row.code} className="rounded-3xl border border-o-ink/12 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <Link href={`/admin/${row.id}`} className="min-w-0">
                            <span className="block text-[22px] leading-none font-extrabold tabular-nums">
                              <span className="mr-2 text-o-ink/45">{row.position}.</span>
                              {row.code}
                            </span>
                            <span className="mt-1.5 block truncate text-[15.5px] font-semibold">
                              {entry.childFirstName}, {entry.childAge} ani
                            </span>
                            <span className="mt-0.5 block text-[13.5px] text-o-ink/60" data-cell="detalii">
                              {votes(row.votes)} · {decimal(row.daysOnline, 1)} zile online
                            </span>
                          </Link>
                          <span className="shrink-0 text-right">
                            <span className="block text-[28px] leading-none font-extrabold tabular-nums" data-cell="pe-zi">
                              {decimal(row.votesPerDay, 2)}
                            </span>
                            <span className="mt-1 block text-[12.5px] text-o-ink/60">voturi pe zi</span>
                          </span>
                        </div>

                        {entry.winnerKind && (
                          <p className={`${CHIP} mt-3 !min-h-[36px] gap-1.5 bg-o-green !px-3.5 !text-[13px] text-white`}>
                            <Trophy className="size-[14px]" strokeWidth={2} />
                            {entry.winnerKind === "vote" ? "Câștigător vot public" : "Ales de juriu"}
                          </p>
                        )}
                        {burstIsSuspicious(burst) && (
                          <p data-flag="rafala" className={`${NOTE} mt-3 flex items-start gap-2.5 font-semibold`}>
                            <TriangleAlert className="mt-0.5 size-[17px] shrink-0" strokeWidth={1.75} />
                            {burst} voturi de la adrese noi în 30 de minute. Verifică înainte să decizi;
                            nu se șterge nimic automat.
                          </p>
                        )}
                        {selecting && entry.winnerKind !== "jury" && entry.status !== "selectat" && (
                          <WinnerButton entryId={row.id} winner={entry.voteWinner} />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}

        <section className="flex flex-col gap-3 border-t border-o-ink/10 pt-5">
          <form method="post" action="/admin/voturi/export">
            <button type="submit" className={BTN_QUIET}>
              <Download className="size-[18px]" strokeWidth={1.75} />
              Exportă voturile (CSV)
            </button>
          </form>
          <p className="text-[13.5px] leading-[1.5] text-o-ink/60">
            Fișierul are codul desenului, grupa, momentul votului și amprenta adresei de e-mail.
            Adresele nu sunt salvate nicăieri. Pragul de alarmă: {BURST_THRESHOLD} adrese noi în 30
            de minute.
          </p>
        </section>
      </div>
    </Shell>
  );
}
