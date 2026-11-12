import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import DrawingGallery from "@/components/DrawingGallery";
import { campaignEnv, campaignOrigin, contestDocLinks, galleryUrl } from "@/lib/campaign-host";
import type { CampaignPhase } from "@/lib/campaign-phase";
import { publicResults } from "@/lib/campaign-results";
import { resultsVisible } from "@/lib/campaign-guards";
import { campaignMoment } from "@/lib/campaign-server";
import { getDb } from "@/lib/db";
import {
  DRAWING_CATEGORIES,
  publicDrawing,
  type DrawingCategory,
  type PublicDrawing,
} from "@/lib/drawing";
import { parseGallerySeed, stableShuffle } from "@/lib/drawing-vote";

/**
 * The public gallery of the drawing contest. Order: random, the same for
 * one visitor on every load (seed from src/proxy.ts), NEVER by votes. The
 * page sends `PublicDrawing` objects only (lib/drawing.ts): no counts, no
 * parent, no café. Copy, buttons and metadata follow the campaign phase.
 */

const DESCRIPTIONS: Record<CampaignPhase, string> = {
  before_open:
    "Copiii între 3 și 14 ani desenează Crăciunul pentru paharul Origins. Primim desene din 16.11.2026, în cafenelele Origins din Oradea.",
  submissions_open:
    "Copiii între 3 și 14 ani desenează Crăciunul pentru paharul Origins. Foaia o primești în cafenea, la orice cumpărătură; desenul îl aduci până pe 01.12.2026.",
  voting_only:
    "Desenele copiilor pentru paharul Origins de Crăciun. Votul e gratuit și e deschis până pe 03.12.2026, la 23:59.",
  voting_closed:
    "Desenele copiilor pentru paharul Origins de Crăciun. Votul s-a încheiat; rezultatele apar din 06.12.2026.",
  results: "Cele zece desene ale copiilor care ajung pe paharele Origins de Crăciun 2026.",
  collection: "Paharele Origins de Crăciun 2026, desenate de copii, sunt în cafenele.",
};

export async function generateMetadata(): Promise<Metadata> {
  const { phase } = await campaignMoment();
  const env = campaignEnv();
  const title = "Desenele copiilor · Origins";
  const description = DESCRIPTIONS[phase];
  return {
    title,
    description,
    // The gallery's one address: the campaign host when it is configured.
    ...(campaignOrigin(env)
      ? {
          metadataBase: new URL(campaignOrigin(env)!),
          alternates: { canonical: galleryUrl(env, null) },
        }
      : {}),
    openGraph: {
      type: "website",
      title,
      description,
      siteName: "Origins Coffee & Drinks",
      locale: "ro_RO",
      ...(campaignOrigin(env) ? { url: galleryUrl(env, null) } : {}),
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

function pick(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function DesenePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [query, cookieStore, headerStore, moment] = await Promise.all([
    searchParams,
    cookies(),
    headers(),
    campaignMoment(),
  ]);
  const { phase } = moment;

  const requested = pick(query.grupa);
  const category = DRAWING_CATEGORIES.includes(requested as DrawingCategory)
    ? (requested as DrawingCategory)
    : null;
  const n = Number(pick(query.n));
  const initial = {
    category,
    query: pick(query.cod).slice(0, 12),
    count: Number.isInteger(n) && n >= 24 ? Math.min(n, 2000) : 24,
  };

  const seed =
    parseGallerySeed(cookieStore.get("origins_galerie")?.value) ??
    parseGallerySeed(headerStore.get("x-origins-galerie")) ??
    1;

  // Newest first from the store: the hero strip shows the latest sheets.
  const entries = await getDb().listPublishedDrawings();
  const all = entries
    .map(publicDrawing)
    .filter((drawing): drawing is PublicDrawing => drawing !== null);

  return (
    <DrawingGallery
      links={contestDocLinks(campaignEnv())}
      drawings={stableShuffle(all, seed)}
      phase={phase}
      total={all.length}
      latest={all.slice(0, 6)}
      cup={all.find((drawing) => drawing.cupImage !== null) ?? null}
      results={resultsVisible(phase) ? publicResults(entries) : null}
      initial={initial}
    />
  );
}
