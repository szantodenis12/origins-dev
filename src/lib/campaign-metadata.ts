import "server-only";

import type { Metadata } from "next";
import { headers } from "next/headers";
import { appOrigin } from "./app-url";
import { campaignCanonical, campaignEnv, campaignOrigin } from "./campaign-host";
import { canVote } from "./campaign-phase";
import { resultsVisible } from "./campaign-guards";
import { campaignMoment } from "./campaign-server";
import { CONTEST_NAME } from "./drawing";

/**
 * Social and canonical metadata of the campaign pages, one default for all
 * of them. A page passes what is its own (its short path, maybe a title, a
 * description, an image) and gets back a complete `Metadata`: title,
 * description, canonical on the campaign host (the short path, e.g.
 * https://xmas.originscafe.ro/R-002; the long /desene path on the request's
 * origin when no campaign host is configured), Open Graph and Twitter card.
 *
 *   export async function generateMetadata() {
 *     return campaignMetadata({ path: "/" });
 *   }
 *
 * Nothing here can carry a count, a rank or anything about a parent.
 */

export interface CampaignMetadataInput {
  /** The SHORT campaign path: "/", "/R-002", "/desen", "/regulament", "/confidentialitate". */
  path?: string;
  /** Page title without the suffix; " · Origins" is added. */
  title?: string;
  /** Replaces the phase-aware default. */
  description?: string;
  /** Absolute or root-relative; width/height when known. */
  image?: { url: string; width?: number; height?: number; alt?: string };
  /** "article" for one drawing, "website" (default) for the rest. */
  type?: "website" | "article";
  /** False for pages that must stay out of search engines. */
  index?: boolean;
}

/**
 * Default share image until a dedicated campaign image exists: the blank
 * cup photo used by the cup mockups (public/cup/cup-blank.jpg, 1856x2304).
 */
export const CAMPAIGN_DEFAULT_IMAGE = {
  url: "/cup/cup-blank.jpg",
  width: 1856,
  height: 2304,
  alt: "Paharul Origins de Crăciun",
};

export const CAMPAIGN_TITLE = "Crăciunul, desenat de cei mici · Origins";

const BASE_DESCRIPTION =
  "Concursul de desene Origins pentru copiii de 3–14 ani: 10 desene ajung pe paharele de Crăciun.";

export async function campaignMetadata(input: CampaignMetadataInput = {}): Promise<Metadata> {
  const env = campaignEnv();
  const requestOrigin = appOrigin(
    await headers(),
    process.env.APP_URL,
    process.env.NODE_ENV === "production",
  );
  const base = campaignOrigin(env) ?? requestOrigin;
  const canonical = campaignCanonical(input.path ?? "/", env, requestOrigin);

  const { phase } = await campaignMoment();
  const description =
    input.description ??
    (canVote(phase)
      ? `${BASE_DESCRIPTION} Votul e deschis până pe 03.12.2026, la 23:59.`
      : resultsVisible(phase)
        ? `${BASE_DESCRIPTION} Rezultatele sunt publice.`
        : BASE_DESCRIPTION);
  const title = input.title ? `${input.title} · Origins` : CAMPAIGN_TITLE;
  const image = input.image ?? CAMPAIGN_DEFAULT_IMAGE;

  return {
    title,
    description,
    ...(base ? { metadataBase: new URL(base) } : {}),
    ...(canonical ? { alternates: { canonical } } : {}),
    ...(input.index === false ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type: input.type ?? "website",
      locale: "ro_RO",
      siteName: CONTEST_NAME,
      title,
      description,
      ...(canonical ? { url: canonical } : {}),
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image.url],
    },
  };
}
