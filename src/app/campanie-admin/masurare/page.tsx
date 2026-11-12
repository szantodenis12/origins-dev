import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Shell from "@/components/campaign-admin/Shell";
import { readCampaignRole } from "@/lib/admin/drawing-access";
import { campaignMeasurement, NO_CHANNEL, NO_LOCATION } from "@/lib/campaign-measurement";
import type { CampaignEventName } from "@/lib/campaign-metrics";
import { getDb } from "@/lib/db";
import { CONTEST_LOCATIONS, isDrawingLocation, contestLocation } from "@/lib/drawing";

export const metadata: Metadata = {
  title: "Măsurare · Panoul desenelor",
  robots: { index: false, follow: false },
};

/**
 * First-party measurement, MANAGER ONLY. Counts, never people: events carry
 * a name and a few slugs (lib/campaign-metrics.ts), and the families number
 * is computed on the server from the stored entries (distinct parent
 * phones among drawings handed in); no phone ever reaches this screen.
 */

const EVENT_LABEL: Record<CampaignEventName, string> = {
  prereg_complete: "Preînregistrări",
  physical_submission: "Desene primite în cafenea",
  publication: "Desene publicate",
  vote_code_request: "Coduri de vot cerute",
  vote_confirmed: "Voturi confirmate",
  instructions_view: "Instrucțiuni văzute",
  prereg_start: "Formulare începute",
  share: "Distribuiri",
  map_click: "Clicuri pe hartă",
};

const COLUMNS: CampaignEventName[] = [
  "prereg_start",
  "prereg_complete",
  "physical_submission",
  "publication",
  "vote_confirmed",
  "share",
];

const n = (value: number | undefined) => (value ?? 0).toLocaleString("ro-RO");

function locationName(slug: string): string {
  if (slug === NO_LOCATION) return "Fără cafenea";
  return isDrawingLocation(slug) ? contestLocation(slug).name : slug;
}

function Table({
  head,
  rows,
}: {
  head: string;
  rows: { key: string; label: string; counts: Partial<Record<CampaignEventName, number>> }[];
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[560px] text-[14px]">
        <thead>
          <tr className="text-left text-[12.5px] text-o-ink/60">
            <th className="pb-2 pr-3 font-semibold">{head}</th>
            {COLUMNS.map((name) => (
              <th key={name} className="pb-2 pl-2 text-right font-semibold">
                {EVENT_LABEL[name]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-o-ink/10">
              <td className="py-2 pr-3 font-semibold">{row.label}</td>
              {COLUMNS.map((name) => (
                <td key={name} className="py-2 pl-2 text-right tabular-nums">
                  {n(row.counts[name])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function CampaignMeasurementPage() {
  const role = await readCampaignRole();
  if (!role || role !== "manager") redirect("/admin");

  const db = getDb();
  const [events, entries] = await Promise.all([db.listCampaignEvents(), db.listDrawingEntries()]);
  const m = campaignMeasurement(events, entries);
  const conversion =
    m.entries.conversion === null
      ? "–"
      : `${Math.round(m.entries.conversion * 100).toLocaleString("ro-RO")}%`;

  const tiles = [
    { label: "Preînregistrări online", value: n(m.entries.preregistered) },
    { label: "Înscrise direct în cafenea", value: n(m.entries.walkIns) },
    { label: "Desene primite în cafenea", value: n(m.entries.submitted) },
    { label: "Familii participante", value: n(m.entries.families) },
    { label: "Preînregistrări aduse în cafenea", value: `${n(m.entries.preregisteredSubmitted)} (${conversion})` },
  ];

  return (
    <Shell role={role} active="masurare">
      <div className="flex flex-col gap-7">
        <div>
          <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.02em]">Măsurare</h1>
          <p className="mt-1.5 text-[15px] leading-[1.5] text-o-ink/70">
            Doar numere, măsurate de noi, fără instrumente externe. O familie = un număr de telefon,
            oricâte desene ar aduce. Canalul vine din linkul de pe care a intrat părintele.
          </p>
        </div>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-section="rezumat">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-3xl border border-o-ink/12 p-4">
              <p className="text-[26px] leading-none font-extrabold tabular-nums">{tile.value}</p>
              <p className="mt-1.5 text-[13.5px] leading-[1.35] text-o-ink/70">{tile.label}</p>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-[20px] font-bold">Pe cafenea</h2>
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-left text-[12.5px] text-o-ink/60">
                  <th className="pb-2 font-semibold">Cafeneaua</th>
                  <th className="pb-2 text-right font-semibold">Preînregistrări</th>
                  <th className="pb-2 text-right font-semibold">Primite</th>
                  <th className="pb-2 text-right font-semibold">Familii</th>
                </tr>
              </thead>
              <tbody>
                {CONTEST_LOCATIONS.map((location) => {
                  const row = m.entries.perLocation.find((item) => item.location === location.slug);
                  return (
                    <tr key={location.slug} className="border-t border-o-ink/10">
                      <td className="py-2 font-semibold">{location.name}</td>
                      <td className="py-2 text-right tabular-nums">{n(row?.preregistered)}</td>
                      <td className="py-2 text-right tabular-nums">{n(row?.submitted)}</td>
                      <td className="py-2 text-right tabular-nums">{n(row?.families)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-[20px] font-bold">Totaluri</h2>
          <ul className="flex flex-col">
            {(Object.keys(EVENT_LABEL) as CampaignEventName[]).map((name) => (
              <li key={name} className="flex justify-between border-t border-o-ink/10 py-2 text-[15px]">
                <span>{EVENT_LABEL[name]}</span>
                <span className="font-bold tabular-nums">{n(m.totals[name])}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-[20px] font-bold">Pe canal</h2>
          {m.perChannel.length === 0 ? (
            <p className="text-[15px] text-o-ink/70">Nimic măsurat încă.</p>
          ) : (
            <Table
              head="Canalul"
              rows={m.perChannel.map((row) => ({
                key: row.channel,
                label: row.channel === NO_CHANNEL ? "Fără canal" : row.channel,
                counts: row.counts,
              }))}
            />
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-[20px] font-bold">Evenimente pe cafenea</h2>
          {m.perLocation.length === 0 ? (
            <p className="text-[15px] text-o-ink/70">Nimic măsurat încă.</p>
          ) : (
            <Table
              head="Cafeneaua"
              rows={m.perLocation.map((row) => ({
                key: row.location,
                label: locationName(row.location),
                counts: row.counts,
              }))}
            />
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-[20px] font-bold">Pe zi</h2>
          {m.perDay.length === 0 ? (
            <p className="text-[15px] text-o-ink/70">Nimic măsurat încă.</p>
          ) : (
            <Table
              head="Ziua"
              rows={[...m.perDay].reverse().map((row) => ({
                key: row.day,
                label: row.day.split("-").reverse().join("."),
                counts: row.counts,
              }))}
            />
          )}
        </section>
      </div>
    </Shell>
  );
}
