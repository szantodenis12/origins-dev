import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TriangleAlert, Trophy } from "lucide-react";
import Shell from "@/components/campaign-admin/Shell";
import {
  AcceptForm,
  JuryButton,
  OpenCollectionButton,
  PublishResultsButton,
  ReserveForm,
} from "@/components/campaign-admin/Selection";
import { CHIP, NOTE } from "@/components/campaign-admin/ui";
import { readCampaignRole } from "@/lib/admin/drawing-access";
import { juryPickRefusal, physicallySubmitted } from "@/lib/campaign-guards";
import {
  canConfirmCollection,
  canPublishResults,
  canSelectWinners,
  CAMPAIGN_DATES,
} from "@/lib/campaign-phase";
import { campaignMoment } from "@/lib/campaign-server";
import { getDb, type DrawingEntry } from "@/lib/db";
import { campaignPrintable } from "@/lib/db/campaign-rules";
import {
  CUP_WINNERS_TOTAL,
  DRAWING_CATEGORIES,
  JURY_PICKS_PER_CATEGORY,
} from "@/lib/drawing";

export const metadata: Metadata = {
  title: "Selecție · Panoul desenelor",
  robots: { index: false, follow: false },
};

/**
 * The final selection, in the order of the rules (regulament art. 9.5,
 * 9^1, 10): 1. the three vote winners (marked on the Voturi screen), 2. the
 * jury picks and the reserve codes from the remaining printable drawings,
 * 3. the acceptance after the private call, 4. the results (from 06.12,
 * accepted winners only) and, once the cups are in the cafés, collection.
 * MANAGER ONLY. The buttons are hints; the server functions decide.
 */

const group = (category: string) => `${category.replace("-", "–")} ani`;

function when(iso: string): string {
  return new Intl.DateTimeFormat("ro-RO", {
    timeZone: "Europe/Bucharest",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function Thumb({ entry }: { entry: DrawingEntry }) {
  return (
    <Link href={`/admin/${entry.id}`} className="flex min-w-0 items-center gap-3">
      <span className="relative flex size-[56px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-o-wall">
        {entry.imageWeb && (
          <Image src={entry.imageWeb} alt="" fill sizes="56px" className="object-contain p-0.5" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-[19px] leading-none font-extrabold tabular-nums">{entry.code}</span>
        <span className="mt-1 block truncate text-[14px] text-o-ink/70">
          {entry.childFirstName}, {entry.childAge} ani
        </span>
      </span>
    </Link>
  );
}

export default async function CampaignSelectionPage() {
  const role = await readCampaignRole();
  if (!role || role !== "manager") redirect("/admin");

  const [{ now, phase }, entries] = await Promise.all([
    campaignMoment(),
    getDb().listDrawingEntries(),
  ]);
  const selecting = canSelectWinners(phase);
  const winners = entries.filter((entry) => entry.winnerKind !== null);
  const accepted = winners.filter((entry) => entry.winnerAcceptedAt !== null);

  return (
    <Shell role={role} active="selectie">
      <div className="flex flex-col gap-7">
        <div>
          <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.02em]">Selecția</h1>
          <p className="mt-1.5 text-[15px] leading-[1.5] text-o-ink/70">
            Pe {CAMPAIGN_DATES.finalSelection}: întâi cei 3 câștigători ai votului, apoi juriul alege 7
            desene și câte o rezervă pe grupă, din desenele care pot ajunge pe pahar. Părinții acceptă
            până pe {CAMPAIGN_DATES.acceptanceDeadline}. Pe site apar doar desenele acceptate.
          </p>
          {!selecting && (
            <p className={`${NOTE} mt-3 flex items-start gap-2.5 font-semibold`}>
              <TriangleAlert className="mt-0.5 size-[17px] shrink-0" strokeWidth={1.75} />
              {phase === "collection"
                ? "Ridicarea a început: selecția nu se mai schimbă."
                : `Selecția se deschide după închiderea votului (${CAMPAIGN_DATES.voteCloses}).`}
            </p>
          )}
          <p className="mt-3 text-[17px] font-bold tabular-nums">
            {winners.length} / {CUP_WINNERS_TOTAL} desene alese · {accepted.length} acceptate
          </p>
        </div>

        {DRAWING_CATEGORIES.map((category) => {
          const inCategory = entries.filter((entry) => entry.category === category);
          const voteWinner = inCategory.find((entry) => entry.winnerKind === "vote") ?? null;
          const candidates = inCategory
            .filter(
              (entry) =>
                entry.winnerKind !== "vote" &&
                entry.status !== "returnat" &&
                physicallySubmitted(entry) &&
                campaignPrintable(entry),
            )
            .sort(
              (a, b) =>
                Number(b.winnerKind === "jury") - Number(a.winnerKind === "jury") ||
                (a.reserveRank ?? 99) - (b.reserveRank ?? 99) ||
                a.code.localeCompare(b.code),
            );
          const juryCount = inCategory.filter((entry) => entry.winnerKind === "jury").length;
          const blockedByVote = candidates.some(
            (entry) => entry.winnerKind === null && juryPickRefusal(entry, entries) === "vote_first",
          );
          return (
            <section key={category} data-category={category} className="flex flex-col gap-3">
              <h2 className="text-[22px] font-extrabold tracking-[-0.01em]">{group(category)}</h2>

              <div className="rounded-3xl border border-o-ink/12 p-4">
                <p className="text-[13.5px] font-semibold text-o-ink/60">1. Votul public</p>
                {voteWinner ? (
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <Thumb entry={voteWinner} />
                    <span className={`${CHIP} !min-h-[36px] gap-1.5 bg-o-green !px-3.5 !text-[13px] text-white`}>
                      <Trophy className="size-[14px]" strokeWidth={2} />
                      Vot public
                    </span>
                  </div>
                ) : (
                  <p className="mt-2 text-[15px]">
                    Niciun câștigător marcat.{" "}
                    <Link href="/admin/voturi" className="font-semibold underline underline-offset-2">
                      Marchează-l din Voturi
                    </Link>
                    .
                  </p>
                )}
              </div>

              <div className="rounded-3xl border border-o-ink/12 p-4">
                <p className="text-[13.5px] font-semibold text-o-ink/60">
                  2. Juriul: {juryCount} din {JURY_PICKS_PER_CATEGORY[category]}, plus o rezervă
                </p>
                {blockedByVote && (
                  <p className="mt-2 text-[14px] text-o-ink/70">
                    Juriul alege după ce e marcat câștigătorul votului din grupa asta.
                  </p>
                )}
                {candidates.length === 0 ? (
                  <p className="mt-2 text-[15px] text-o-ink/70">
                    Niciun desen primit în cafenea care să poată ajunge pe pahar.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-3">
                    {candidates.map((entry) => (
                      <li key={entry.id} data-code={entry.code} className="flex flex-col gap-2.5 border-t border-o-ink/10 pt-3">
                        <div className="flex items-center justify-between gap-3">
                          <Thumb entry={entry} />
                          {entry.winnerKind === "jury" ? (
                            <span className={`${CHIP} !min-h-[36px] bg-o-green !px-3.5 !text-[13px] text-white`}>Juriu</span>
                          ) : entry.reserveRank !== null ? (
                            <span className={`${CHIP} !min-h-[36px] bg-o-wall !px-3.5 !text-[13px]`}>
                              Rezerva {entry.reserveRank}
                            </span>
                          ) : null}
                        </div>
                        <JuryButton entryId={entry.id} picked={entry.winnerKind === "jury"} disabled={!selecting} />
                        {entry.winnerKind === null && (
                          <ReserveForm entryId={entry.id} rank={entry.reserveRank} disabled={!selecting} />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          );
        })}

        <section className="flex flex-col gap-3" data-section="acceptare">
          <h2 className="text-[22px] font-extrabold tracking-[-0.01em]">3. Acceptarea</h2>
          <p className="text-[14.5px] leading-[1.5] text-o-ink/70">
            După apelul privat, notează data din formularul de acceptare semnat. Fără acceptare până pe{" "}
            {CAMPAIGN_DATES.acceptanceDeadline}, locul trece la rezervă: scoate desenul și alege rezerva.
          </p>
          {winners.length === 0 ? (
            <p className="rounded-3xl bg-o-wall px-5 py-6 text-[15px] text-o-ink/70">Niciun desen ales încă.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {winners
                .sort((a, b) => a.category.localeCompare(b.category) || a.code.localeCompare(b.code))
                .map((entry) => (
                  <li key={entry.id} className="flex flex-col gap-2.5 rounded-3xl border border-o-ink/12 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <Thumb entry={entry} />
                      <span className="shrink-0 text-[13px] font-semibold text-o-ink/60">
                        {entry.winnerKind === "vote" ? "Vot public" : "Juriu"} · {group(entry.category)}
                      </span>
                    </div>
                    {!entry.consentGallery && (
                      <p className="text-[13.5px] text-o-ink/60">
                        Fără acord pentru galerie: se anunță în cafenele, nu pe site.
                      </p>
                    )}
                    <AcceptForm
                      entryId={entry.id}
                      acceptedLabel={entry.winnerAcceptedAt ? when(entry.winnerAcceptedAt) : null}
                      disabled={!selecting}
                    />
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3 border-t border-o-ink/10 pt-5" data-section="rezultate">
          <h2 className="text-[22px] font-extrabold tracking-[-0.01em]">4. Rezultatele și ridicarea</h2>
          <p className="text-[14.5px] leading-[1.5] text-o-ink/70">
            Rezultatele se pot publica din {CAMPAIGN_DATES.announcement}. Pe site apar doar cele{" "}
            {accepted.length} desene acceptate. Ridicarea se deschide doar când paharele sunt fizic în
            cafenele, nu la o dată fixă.
          </p>
          <PublishResultsButton enabled={canPublishResults(now, phase)} />
          <OpenCollectionButton enabled={canConfirmCollection(phase)} />
        </section>
      </div>
    </Shell>
  );
}
