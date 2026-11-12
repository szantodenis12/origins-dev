import type { Metadata } from "next";
import Link from "next/link";
import { Download, Plus, Search } from "lucide-react";
import Login from "@/components/campaign-admin/Login";
import { DeleteData, DrawingRow, type PanelRow } from "@/components/campaign-admin/Rows";
import Shell from "@/components/campaign-admin/Shell";
import { BTN_PRIMARY, BTN_QUIET, CHIP } from "@/components/campaign-admin/ui";
import { campaignLoginAvailable } from "@/lib/admin/campaign-session-token";
import { readCampaignRole } from "@/lib/admin/drawing-access";
import { getDb } from "@/lib/db";
import {
  CONTEST_LOCATIONS,
  contestLocation,
  drawingIsLive,
  isDrawingLocation,
  normalizeDrawingCode,
} from "@/lib/drawing";
import { normalizePhone } from "@/lib/phone";

/**
 * The campaign panel, reached as /admin on the campaign host (src/proxy.ts
 * rewrites it to this internal tree; on the main host this path is a 404).
 * Drawings only. Not logged in: the PIN screen. Logged in: the list, with
 * the camera one tap away on every row. No parent name, no phone: those
 * leave only through the manager's export.
 */

export const metadata: Metadata = {
  title: "Panoul desenelor",
  robots: { index: false, follow: false },
};

function pick(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function CampaignAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const role = await readCampaignRole();
  if (!role) {
    return (
      <Login
        available={campaignLoginAvailable(
          {
            CAMPAIGN_ADMIN_PIN_MANAGER: process.env.CAMPAIGN_ADMIN_PIN_MANAGER,
            CAMPAIGN_ADMIN_PIN_STAFF: process.env.CAMPAIGN_ADMIN_PIN_STAFF,
          },
          process.env.NODE_ENV === "production",
        )}
      />
    );
  }

  const query = await searchParams;
  const manager = role === "manager";
  const requested = pick(query.loc);
  const location = isDrawingLocation(requested) ? requested : null;
  const wantedCode = normalizeDrawingCode(pick(query.cod));
  // A preregistered parent may only know the phone: matched here, on the
  // server, and never shown back on the screen.
  const wantedPhone = wantedCode ? null : normalizePhone(pick(query.cod));
  const searching = wantedCode !== null || wantedPhone !== null;

  const entries = await getDb().listDrawingEntries(location ? { location } : undefined);
  const visible = wantedCode
    ? entries.filter((entry) => entry.code === wantedCode)
    : wantedPhone
      ? entries.filter((entry) => entry.phone === wantedPhone)
      : entries;
  // Exactly what the screen may show: nothing about the parent.
  const rows: PanelRow[] = visible.map((entry) => ({
    id: entry.id,
    code: entry.code,
    childFirstName: entry.childFirstName,
    childAge: entry.childAge,
    category: entry.category,
    locationName: contestLocation(entry.location).name,
    status: entry.status,
    consentGallery: entry.consentGallery,
    consentReproduction: entry.consentReproduction,
    image: entry.imageWeb,
    live: drawingIsLive(entry),
    sheetKind: entry.sheetKind,
  }));
  const awaiting = entries.filter((entry) => entry.status === "inregistrat").length;
  const waiting = entries.filter(
    (entry) => entry.consentGallery && !drawingIsLive(entry) && entry.status !== "returnat",
  ).length;

  return (
    <Shell role={role} active="desene">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.02em]">Desene</h1>
          <p className="mt-1.5 text-[15px] leading-[1.5] text-o-ink/70">
            {entries.length === 1 ? "1 desen înscris" : `${entries.length} desene înscrise`}
            {waiting > 0 ? `, ${waiting} de pus online.` : "."}
            {awaiting > 0
              ? ` ${awaiting === 1 ? "1 preînregistrare așteaptă" : `${awaiting} preînregistrări așteaptă`} desenul în cafenea.`
              : ""}{" "}
            Un desen ajunge în galerie în cel mult 24 de ore de la depunere.
          </p>
        </div>

        <Link href="/admin/nou" className={BTN_PRIMARY}>
          <Plus className="size-[20px]" strokeWidth={2} />
          Înscrie un desen în cafenea
        </Link>

        {/* GET on purpose: the search is a URL, shareable between phones. */}
        <form method="get" action="/admin" className="flex gap-2">
          {location && <input type="hidden" name="loc" value={location} />}
          <input
            name="cod"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            defaultValue={pick(query.cod)}
            placeholder="Cod (R-012) sau telefonul părintelui"
            aria-label="Caută după cod sau telefon"
            className="min-h-[52px] w-full rounded-2xl border border-o-ink/20 bg-white px-4 text-[16px] outline-none placeholder:text-o-ink/40 focus:border-o-ink"
          />
          <button
            type="submit"
            aria-label="Caută"
            className="flex size-[52px] shrink-0 items-center justify-center rounded-2xl bg-o-ink text-white"
          >
            <Search className="size-[20px]" strokeWidth={2} />
          </button>
        </form>

        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Cafeneaua">
          <Link
            href="/admin"
            className={`${CHIP} ${location === null ? "bg-o-ink text-white" : "border border-o-ink/15"}`}
          >
            Toate
          </Link>
          {CONTEST_LOCATIONS.map((item) => (
            <Link
              key={item.slug}
              href={`/admin?loc=${item.slug}`}
              className={`${CHIP} ${
                location === item.slug ? "bg-o-ink text-white" : "border border-o-ink/15"
              }`}
            >
              {item.name}
            </Link>
          ))}
        </nav>

        {rows.length === 0 ? (
          <p className="rounded-3xl bg-o-wall px-5 py-10 text-center text-[15.5px] text-o-ink/70">
            {searching ? "Niciun desen găsit." : "Niciun desen înscris aici încă."}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <DrawingRow key={row.id} row={row} manager={manager} />
            ))}
          </ul>
        )}

        {manager && (
          <section className="mt-4 flex flex-col gap-3 border-t border-o-ink/10 pt-5">
            <form method="post" action="/admin/export">
              <button type="submit" className={BTN_QUIET}>
                <Download className="size-[18px]" strokeWidth={1.75} />
                Exportă lista (CSV, cu părinți și telefoane)
              </button>
            </form>
            <p className="text-[13.5px] leading-[1.5] text-o-ink/60">
              Fișierul conține datele personale ale părinților. Exportul se notează în jurnal. După
              31.01.2027 datele concursului se șterg de aici: înscrierile, fotografiile și voturile.
            </p>
            <DeleteData />
          </section>
        )}
      </div>
    </Shell>
  );
}
