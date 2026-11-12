import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import DrawingView from "@/components/DrawingView";
import { appOrigin } from "@/lib/app-url";
import { campaignEnv, contestDocLinks, drawingUrl } from "@/lib/campaign-host";
import { getDb } from "@/lib/db";
import {
  drawingIsLive,
  normalizeDrawingCode,
  publicDrawing,
  type PublicDrawing,
} from "@/lib/drawing";
import { canVote } from "@/lib/campaign-phase";
import { campaignMoment } from "@/lib/campaign-server";
import { parseGallerySeed, stableShuffle } from "@/lib/drawing-vote";
import { readVerifiedVoter } from "@/lib/vote-server";

/**
 * One drawing: the page a parent's WhatsApp link opens. The public payload
 * is `PublicDrawing` and two booleans about THIS browser (address already
 * verified, already voted here). Nothing about how many votes it has.
 */

async function liveDrawing(
  rawCode: string,
): Promise<{ id: string; drawing: PublicDrawing } | null> {
  const code = normalizeDrawingCode(decodeURIComponent(rawCode));
  if (!code) return null;
  const entry = await getDb().findDrawingEntryByCode(code);
  if (!entry || !drawingIsLive(entry)) return null;
  const drawing = publicDrawing(entry);
  return drawing ? { id: entry.id, drawing } : null;
}

async function origin(): Promise<string | null> {
  return appOrigin(
    await headers(),
    process.env.APP_URL,
    process.env.NODE_ENV === "production",
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const found = await liveDrawing((await params).code);
  if (!found) return { title: "Desenele copiilor · Origins", robots: { index: false } };

  const { drawing } = found;
  const who =
    drawing.firstName !== null
      ? `${drawing.firstName}, ${drawing.age} ani`
      : `Desenul ${drawing.code}`;
  const title = `${who} · Desenele copiilor · Origins`;
  const { phase } = await campaignMoment();
  const description =
    canVote(phase) && drawing.votable
      ? "Un desen pentru paharul Origins de Crăciun. Votul e gratuit, până pe 03.12.2026, la 23:59."
      : "Un desen de Crăciun din galeria Origins 2026.";

  const base = await origin();
  // One public address per drawing: the short campaign link when the
  // campaign host is configured (lib/campaign-host.ts).
  const path = drawingUrl(drawing.code, campaignEnv(), base);
  // The cup mockup when there is one, the drawing itself otherwise.
  const image = drawing.cupImage
    ? { url: drawing.cupImage, alt: who }
    : {
        url: drawing.image,
        width: drawing.imageWidth,
        height: drawing.imageHeight,
        alt: who,
      };

  return {
    title,
    description,
    ...(base ? { metadataBase: new URL(base) } : {}),
    alternates: { canonical: path },
    // A page per child (first name + age): shareable by link, kept out of
    // search results. The gallery itself stays indexable.
    robots: { index: false, follow: true },
    openGraph: {
      type: "article",
      title,
      description,
      url: path,
      siteName: "Origins Coffee & Drinks",
      locale: "ro_RO",
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default async function DesenPublicPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const found = await liveDrawing((await params).code);
  if (!found) notFound();

  const [base, voter, published, cookieStore, moment] = await Promise.all([
    origin(),
    readVerifiedVoter(),
    getDb().listPublishedDrawings(),
    cookies(),
    campaignMoment(),
  ]);
  const voted = voter ? await getDb().hasVoted(found.id, voter) : false;

  // "Alte desene din grupa ...": four from the same age group, in the same
  // per-visitor random order as the gallery. Never by votes.
  const seed = parseGallerySeed(cookieStore.get("origins_galerie")?.value) ?? 1;
  const others = stableShuffle(
    published
      .filter((entry) => entry.id !== found.id && entry.category === found.drawing.category)
      .map(publicDrawing)
      .filter((drawing): drawing is PublicDrawing => drawing !== null),
    seed,
  ).slice(0, 4);

  return (
    <DrawingView
      links={contestDocLinks(campaignEnv())}
      drawing={found.drawing}
      shareUrl={drawingUrl(found.drawing.code, campaignEnv(), base)}
      phase={moment.phase}
      voterKnown={voter !== null}
      alreadyVoted={voted}
      others={others}
    />
  );
}
