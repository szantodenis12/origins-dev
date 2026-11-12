import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Plus, Search } from "lucide-react";
import AdminBar from "@/components/admin/AdminBar";
import PhoneFrame from "@/components/PhoneFrame";
import { readStaffSession } from "@/lib/admin/session";
import { getDb } from "@/lib/db";
import {
  CONTEST_LOCATIONS,
  contestLocationForStaff,
  DRAWING_CATEGORIES,
  drawingIsLive,
  isDrawingLocation,
  normalizeDrawingCode,
  type DrawingLocation,
} from "@/lib/drawing";
import DrawingList, {
  DeleteCampaign,
  type DrawingRow,
} from "./DrawingList";

export const metadata: Metadata = {
  title: "Desene Origins",
  robots: { index: false, follow: false },
};

/** Staff screen: Romanian only. */
const strings = {
  eyebrow: "Origins · concurs de desene",
  title: "Desene",
  intro:
    "Înscrierile din concursul de Crăciun. Numele părinților și telefoanele nu apar aici: sunt doar în exportul managerului.",
  newEntry: "Înscrie un desen în cafenea",
  votes: "Votul public și cele zece desene",
  photoHint:
    "Deschide un desen ca să îi faci poza și să îl publici în galerie. Ținta: online în 24 de ore de la depunere.",
  search: "Caută după cod (R-012)",
  searchButton: "Caută",
  allLocations: "Toate cafenelele",
  perLocation: "Per cafenea",
  perCategory: "Per categorie",
  years: "ani",
  notContestLocation:
    "Cafeneaua ta nu primește desene; vezi toate înscrierile.",
  export: "Exportă lista (CSV, cu părinți și telefoane)",
  exportNote:
    "Fișierul conține datele personale ale părinților. Exportul se notează în jurnal.",
  deleteTitle: "Finalul campaniei",
  deleteNote:
    "După 31.01.2027 datele concursului se șterg de aici: toate înscrierile, cu nume și telefoane, fotografiile desenelor și voturile. Jurnalul păstrează acțiunile, fără coduri.",
};

function pick(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function DesenePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await readStaffSession();
  if (!session) redirect("/admin");

  const query = await searchParams;
  const manager = session.role === "manager";

  // A barista sees their own cafenea; a manager sees all, with a filter.
  const own = contestLocationForStaff(session.locationSlug);
  const requested = pick(query.loc);
  const location: DrawingLocation | null = manager
    ? isDrawingLocation(requested)
      ? requested
      : null
    : own;

  const db = getDb();
  const [cafenea, entries] = await Promise.all([
    db.getLocationBySlug(session.locationSlug),
    db.listDrawingEntries(location ? { location } : undefined),
  ]);

  const wantedCode = normalizeDrawingCode(pick(query.cod));
  const visible = wantedCode
    ? entries.filter((entry) => entry.code === wantedCode)
    : entries;

  // Only what the list is allowed to show: nothing about the parent.
  const rows: DrawingRow[] = visible.map((entry) => ({
    id: entry.id,
    code: entry.code,
    location: entry.location,
    childFirstName: entry.childFirstName,
    childAge: entry.childAge,
    category: entry.category,
    status: entry.status,
    createdAt: entry.createdAt,
    consentReproduction: entry.consentReproduction,
    attribution: entry.attribution,
    consentPhoto: entry.consentPhoto,
    circleOptIn: entry.circleOptIn,
    consentGallery: entry.consentGallery,
    hasPhoto: entry.imageWeb !== null,
    live: drawingIsLive(entry),
    sheetKind: entry.sheetKind,
  }));

  const countBy = <T extends string>(keys: T[], key: (e: (typeof entries)[number]) => T) =>
    keys.map((k) => ({ key: k, count: entries.filter((e) => key(e) === k).length }));
  const perLocation = countBy(
    CONTEST_LOCATIONS.map((l) => l.slug),
    (e) => e.location,
  );
  const perCategory = countBy(DRAWING_CATEGORIES, (e) => e.category);
  const locationName = (slug: string) =>
    CONTEST_LOCATIONS.find((l) => l.slug === slug)?.name ?? slug;

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold ${
      active ? "bg-ink text-paper" : "bg-cream text-sage-deep"
    }`;

  return (
    <PhoneFrame>
      <AdminBar
        locationName={cafenea?.name ?? session.locationSlug}
        role={session.role}
      />

      <div className="px-5 pt-[22px] pb-1.5">
        <div className="text-[11px] font-bold tracking-[0.18em] text-sage-deep uppercase">
          {strings.eyebrow}
        </div>
        <h1 className="mt-1 mb-2 text-[30px] font-extrabold tracking-[-0.02em]">
          {strings.title}
        </h1>
        <p className="text-[13.5px] leading-[1.5] text-ink/72">{strings.intro}</p>
        {!manager && own === null && (
          <p className="mt-2 text-[12.5px] text-muted">{strings.notContestLocation}</p>
        )}
      </div>

      <div className="flex flex-col gap-4 px-5 pt-4 pb-8">
        <Link
          href="/admin/desene/nou"
          className="flex w-full items-center justify-center gap-2 rounded-btn bg-ink p-[13px] text-[14px] font-semibold text-paper"
        >
          <Plus className="size-[17px]" strokeWidth={2.25} />
          {strings.newEntry}
        </Link>

        {manager && (
          <Link
            href="/admin/desene/voturi"
            className="flex w-full items-center justify-center gap-2 rounded-btn border border-line bg-paper p-[13px] text-[14px] font-semibold text-ink"
          >
            <BarChart3 className="size-[16px] text-sage-deep" strokeWidth={2.25} />
            {strings.votes}
          </Link>
        )}
        <p className="-mt-1 text-[12px] leading-[1.5] text-muted">{strings.photoHint}</p>

        {manager && (
          <div className="flex gap-1.5 overflow-x-auto">
            <Link href="/admin/desene" className={chip(location === null)}>
              {strings.allLocations}
            </Link>
            {CONTEST_LOCATIONS.map((item) => (
              <Link
                key={item.slug}
                href={`/admin/desene?loc=${item.slug}`}
                className={chip(location === item.slug)}
              >
                {item.name}
              </Link>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-card border border-line p-3.5">
            <div className="text-[10.5px] font-bold tracking-[0.16em] text-sage-deep uppercase">
              {strings.perLocation}
            </div>
            {perLocation.map((item) => (
              <div key={item.key} className="mt-1.5 flex items-center justify-between gap-2 text-[12.5px]">
                <span className="truncate text-ink/72">{locationName(item.key)}</span>
                <span className="font-bold tabular-nums">{item.count}</span>
              </div>
            ))}
          </div>
          <div className="rounded-card border border-line p-3.5">
            <div className="text-[10.5px] font-bold tracking-[0.16em] text-sage-deep uppercase">
              {strings.perCategory}
            </div>
            {perCategory.map((item) => (
              <div key={item.key} className="mt-1.5 flex items-center justify-between gap-2 text-[12.5px]">
                <span className="text-ink/72">
                  {item.key} {strings.years}
                </span>
                <span className="font-bold tabular-nums">{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* GET on purpose: the search is a URL, shareable between phones. */}
        <form method="get" action="/admin/desene" className="flex gap-2">
          {location && manager && <input type="hidden" name="loc" value={location} />}
          <input
            name="cod"
            type="text"
            autoComplete="off"
            defaultValue={pick(query.cod)}
            placeholder={strings.search}
            aria-label={strings.search}
            className="w-full rounded-btn border border-line bg-paper px-3.5 py-3 text-[15px] text-ink outline-none placeholder:text-muted focus:border-sage-deep"
          />
          <button
            type="submit"
            aria-label={strings.searchButton}
            title={strings.searchButton}
            className="flex size-[46px] shrink-0 items-center justify-center rounded-btn bg-ink text-paper"
          >
            <Search className="size-[17px]" strokeWidth={2.25} />
          </button>
        </form>

        <DrawingList
          rows={rows}
          manager={manager}
          showLocation={location === null}
        />

        {manager && (
          <section className="mt-2 flex flex-col gap-2">
            <form method="post" action="/admin/desene/export">
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-btn border border-line bg-paper p-[13px] text-[14px] font-semibold text-ink"
              >
                {strings.export}
              </button>
            </form>
            <p className="text-[12px] leading-[1.5] text-muted">{strings.exportNote}</p>

            <h2 className="mt-4 text-[11px] font-bold tracking-[0.16em] text-sage-deep uppercase">
              {strings.deleteTitle}
            </h2>
            <p className="text-[12px] leading-[1.5] text-muted">{strings.deleteNote}</p>
            <DeleteCampaign />
          </section>
        )}
      </div>
    </PhoneFrame>
  );
}
