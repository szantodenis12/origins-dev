import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  BellRing,
  Coffee,
  FileDown,
  Gift,
  ScrollText,
  ShieldCheck,
  Stamp,
  Star,
  UserCheck,
  Users,
} from "lucide-react";
import AdminBar from "@/components/admin/AdminBar";
import PhoneFrame from "@/components/PhoneFrame";
import { formatBucharestDateTime } from "@/app/admin/push/shared";
import { readStaffSession } from "@/lib/admin/session";
import { getDb, type LocationStats } from "@/lib/db";
import { formatRating } from "@/lib/format";

/** "1 membru", "5 membri", "20 de membri" — counts read as Romanian. */
function membri(count: number): string {
  if (count === 1) return "1 membru";
  const rest = count % 100;
  return rest >= 1 && rest <= 19 ? `${count} membri` : `${count} de membri`;
}

/** Staff screen: Romanian only, read-only. */
const strings = {
  eyebrow: "Origins · manager",
  title: "Statistici",
  intro: "Cifrele din baza de date, la momentul încărcării paginii.",
  members: "Membri",
  membersTotal: "Membri înscriși",
  members30d: "Înscriși în ultimele 30 de zile",
  students: "Elevi și studenți declarați",
  studentsVerified: (count: number) => `${count} cu legitimație validată`,
  goldMembers: "Membri Gold activi",
  stamps: "Ștampile",
  stampsTotal: "Total ștampile",
  stamps7d: "Ultimele 7 zile",
  stamps30d: "Ultimele 30 de zile",
  reviewBonuses: "Bonusuri de recenzie acordate",
  rewards: "Recompense",
  rewardsTotal: "Recompense predate",
  rewardsEmpty: "Nicio recompensă predată până acum.",
  locations: "Per cafenea",
  locationStamps7d: "Ștampile 7z",
  locationStamps30d: "Ștampile 30z",
  locationRedemptions30d: "Recompense 30z",
  reviews: (count: number) => `(${count} recenzii)`,
  baristas: "Bariști",
  baristasNote:
    "Activitate de scanare, nu clasament: turele aglomerate dau cifre mari. Zero pe mai multe zile înseamnă că acolo nu se scanează.",
  baristaRewards: "Recomp.",
  push: "Push",
  campaignsSent: "Campanii trimise",
  pushNote: "Trimiterea către cardurile din Wallet pornește în faza 3.",
  gdpr: "Date personale",
  exportMembers: "Exportă lista de membri (CSV)",
  exportNote:
    "Fișierul se deschide în Excel și conține datele personale ale membrilor. Exportul se notează în jurnal.",
  consentCurrent: "Toți membrii au acceptat versiunea curentă a regulamentului.",
  consentOutdated: (count: number) =>
    `${membri(count)} ${count === 1 ? "a acceptat" : "au acceptat"} o versiune mai veche a regulamentului. La o schimbare importantă a programului, actualizează textul regulamentului și versiunea lui, apoi anunță membrii.`,
  retentionNone: "Niciun membru nu a depășit perioada de retenție de 24 de luni.",
  retentionDue: (count: number) =>
    `${membri(count)} nu ${count === 1 ? "a" : "au"} mai avut activitate de peste 24 de luni. Politica de retenție propune ștergerea datelor lor. Nimic nu se șterge automat de aici: ștergerea se face manual, per membru, din ecranul de scanare.`,
  audit: "Jurnal de modificări",
  auditNote:
    "Cine a schimbat programul, echipa sau un card, și când. Ultimele 50.",
  auditEmpty: "Nicio modificare înregistrată încă.",
  footer:
    "Meniul este real. Membrii, ștampilele și recompensele sunt rânduri demo, până la conectarea Supabase.",
};

export const metadata: Metadata = {
  title: "Statistici Origins",
  robots: { index: false, follow: false },
};

export default async function StatsPage() {
  const session = await readStaffSession();
  if (!session) redirect("/admin");
  if (session.role !== "manager") redirect("/admin/scan");

  const db = getDb();
  const [location, stats, audit] = await Promise.all([
    db.getLocationBySlug(session.locationSlug),
    db.getStats(),
    db.listAudit({ limit: 50 }),
  ]);

  return (
    <PhoneFrame>
      <AdminBar
        locationName={location?.name ?? session.locationSlug}
        role={session.role}
      />

      <div className="px-5 pt-[22px] pb-1.5">
        <div className="text-[11px] font-bold tracking-[0.18em] text-sage-deep uppercase">
          {strings.eyebrow}
        </div>
        <h1 className="mt-1 mb-2 text-[30px] font-extrabold tracking-[-0.02em]">
          {strings.title}
        </h1>
        <p className="text-[13.5px] text-ink/72">{strings.intro}</p>
      </div>

      <div className="flex flex-col gap-6 px-5 pt-5 pb-7">
        <section>
          <SectionTitle icon={<Users {...ICON} />} label={strings.members} />
          <div className="grid grid-cols-2 gap-2.5">
            <Tile value={stats.membersTotal} label={strings.membersTotal} />
            <Tile value={stats.members30d} label={strings.members30d} />
            <Tile value={stats.goldMembers} label={strings.goldMembers} />
            <Tile
              value={stats.studentsTotal}
              label={strings.students}
              note={strings.studentsVerified(stats.studentsVerified)}
            />
          </div>
        </section>

        <section>
          <SectionTitle icon={<Stamp {...ICON} />} label={strings.stamps} />
          <div className="grid grid-cols-2 gap-2.5">
            <Tile value={stats.stampsTotal} label={strings.stampsTotal} />
            <Tile value={stats.stamps7d} label={strings.stamps7d} />
            <Tile value={stats.stamps30d} label={strings.stamps30d} />
            <Tile value={stats.reviewBonuses} label={strings.reviewBonuses} />
          </div>
        </section>

        <section>
          <SectionTitle icon={<Gift {...ICON} />} label={strings.rewards} />
          <Tile
            value={stats.redemptionsTotal}
            label={strings.rewardsTotal}
            wide
          />
          <div className="mt-2.5 rounded-card border border-line">
            {stats.redemptionsByReward.length === 0 ? (
              <p className="px-4 py-3.5 text-[12.5px] text-muted">
                {strings.rewardsEmpty}
              </p>
            ) : (
              stats.redemptionsByReward.map((reward, index) => (
                <div
                  key={reward.rewardId}
                  className={`flex items-center justify-between gap-3 px-4 py-3 ${
                    index > 0 ? "border-t border-line" : ""
                  }`}
                >
                  <span className="text-[13px] text-ink">{reward.name}</span>
                  <span className="text-[15px] font-bold tabular-nums">
                    {reward.count}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section>
          <SectionTitle icon={<Coffee {...ICON} />} label={strings.locations} />
          <div className="flex flex-col gap-2.5">
            {stats.locations.map((item) => (
              <LocationCard key={item.slug} location={item} />
            ))}
          </div>
        </section>

        <section>
          <SectionTitle
            icon={<UserCheck {...ICON} />}
            label={strings.baristas}
          />
          <p className="mb-2.5 text-[12px] leading-[1.5] text-muted">
            {strings.baristasNote}
          </p>
          <div className="rounded-card border border-line">
            {stats.baristas.map((barista, index) => (
              <div
                key={barista.staffId}
                className={`flex items-center justify-between gap-3 px-4 py-3 ${
                  index > 0 ? "border-t border-line" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-ink">
                    {barista.name}
                  </div>
                  <div className="text-[11.5px] text-muted">
                    {barista.locationName}
                  </div>
                </div>
                <div className="flex shrink-0 gap-3 text-right tabular-nums">
                  <BaristaStat value={barista.stamps7d} label="7z" />
                  <BaristaStat value={barista.stamps30d} label="30z" />
                  <BaristaStat
                    value={barista.redemptions30d}
                    label={strings.baristaRewards}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle icon={<BellRing {...ICON} />} label={strings.push} />
          <Tile
            value={stats.campaignsSent}
            label={strings.campaignsSent}
            note={strings.pushNote}
            wide
          />
        </section>

        <section>
          <SectionTitle icon={<ShieldCheck {...ICON} />} label={strings.gdpr} />
          {/* Plain form, no JS: the POST response is an attachment, so the
              browser downloads it and stays on this page. */}
          <form method="post" action="/admin/statistici/export">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-btn border border-line bg-paper p-[13px] text-[14px] font-semibold text-ink"
            >
              <FileDown className="size-[17px] text-sage-deep" strokeWidth={2} />
              {strings.exportMembers}
            </button>
          </form>
          <p className="mt-2 text-[12px] leading-[1.5] text-muted">
            {strings.exportNote}
          </p>
          <p className="mt-3 rounded-card bg-cream px-4 py-3 text-[12.5px] leading-[1.5] text-ink/72">
            {stats.consentOutdated === 0
              ? strings.consentCurrent
              : strings.consentOutdated(stats.consentOutdated)}
          </p>
          <p className="mt-2 rounded-card bg-cream px-4 py-3 text-[12.5px] leading-[1.5] text-ink/72">
            {stats.retentionDue === 0
              ? strings.retentionNone
              : strings.retentionDue(stats.retentionDue)}
          </p>
        </section>

        {/* Read-only: the Jurnal is written by the actions themselves. */}
        <section>
          <SectionTitle icon={<ScrollText {...ICON} />} label={strings.audit} />
          <p className="mb-2.5 text-[12px] leading-[1.5] text-muted">
            {strings.auditNote}
          </p>
          <div className="rounded-card border border-line">
            {audit.length === 0 ? (
              <p className="px-4 py-3.5 text-[12.5px] text-muted">
                {strings.auditEmpty}
              </p>
            ) : (
              audit.map((entry, index) => (
                <p
                  key={entry.id}
                  className={`px-4 py-3 text-[12.5px] leading-[1.5] text-ink ${
                    index > 0 ? "border-t border-line" : ""
                  }`}
                >
                  <span className="text-muted tabular-nums">
                    {formatBucharestDateTime(entry.at)}
                  </span>{" "}
                  · <span className="font-semibold">{entry.staffName}</span> ·{" "}
                  {entry.summary}
                </p>
              ))
            )}
          </div>
        </section>

        <p className="text-[12px] leading-[1.5] text-muted">{strings.footer}</p>
      </div>
    </PhoneFrame>
  );
}

const ICON = { className: "size-[15px] text-sage-deep", strokeWidth: 2.25 };

function SectionTitle({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <h2 className="mb-2.5 flex items-center gap-2 text-[11px] font-bold tracking-[0.16em] text-sage-deep uppercase">
      {icon}
      {label}
    </h2>
  );
}

function Tile({
  value,
  label,
  note,
  wide = false,
}: {
  value: number;
  label: string;
  note?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`rounded-card border border-line p-4 ${wide ? "col-span-2" : ""}`}
    >
      <div className="text-[26px] leading-none font-extrabold tracking-[-0.02em] tabular-nums">
        {value}
      </div>
      <div className="mt-1.5 text-[12.5px] leading-[1.35] text-ink/72">
        {label}
      </div>
      {note && <div className="mt-1 text-[12px] text-muted">{note}</div>}
    </div>
  );
}

/** Locations without activity stay in the list, with zeros. */
function LocationCard({ location }: { location: LocationStats }) {
  return (
    <div className="rounded-card border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[15px] font-bold tracking-[-0.01em]">
          {location.name}
        </span>
        {location.googleRating !== null && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12px] font-semibold text-ink">
            <Star className="size-3.5 fill-star text-star" strokeWidth={1} />
            {formatRating(location.googleRating)}
            {location.googleReviewCount !== null && (
              <span className="font-medium text-muted">
                {strings.reviews(location.googleReviewCount)}
              </span>
            )}
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStat value={location.stamps7d} label={strings.locationStamps7d} />
        <MiniStat
          value={location.stamps30d}
          label={strings.locationStamps30d}
        />
        <MiniStat
          value={location.redemptions30d}
          label={strings.locationRedemptions30d}
        />
      </div>
    </div>
  );
}

function BaristaStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="w-[42px]">
      <div className="text-[15px] leading-none font-bold">{value}</div>
      <div className="mt-0.5 text-[10.5px] text-muted">{label}</div>
    </div>
  );
}

function MiniStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-btn bg-cream px-3 py-2.5">
      <div className="text-[17px] leading-none font-bold tabular-nums">
        {value}
      </div>
      <div className="mt-1 text-[11px] leading-[1.3] text-muted">{label}</div>
    </div>
  );
}
