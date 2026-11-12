import type { Metadata } from "next";
import { headers } from "next/headers";
import DrawingSignup from "@/components/DrawingSignup";
import { appOrigin } from "@/lib/app-url";
import { campaignEnv, contestDocLinks, drawingUrl } from "@/lib/campaign-host";
import { sanitizeEventProps } from "@/lib/campaign-metrics";
import { campaignMoment } from "@/lib/campaign-server";
import { CONTEST_LOCATIONS } from "@/lib/drawing";

/**
 * The OPTIONAL online preregistration: the parent gets the drawing's code
 * in advance; the entry is confirmed only at the café (regulament art.
 * 5.3). Open only in the submissions phase; the page says so otherwise.
 */

export async function generateMetadata(): Promise<Metadata> {
  const { phase } = await campaignMoment();
  const description =
    phase === "submissions_open"
      ? "Preînregistrare opțională: primești codul desenului dinainte. Participarea se confirmă când aduci desenul și formularul semnat la cafenea, până pe 01.12.2026."
      : phase === "before_open"
        ? "Preînregistrarea desenelor se deschide pe 16.11.2026."
        : "Înscrierile s-au încheiat pe 01.12.2026.";
  return {
    title: "Preînregistrare desen · Origins",
    description,
    robots: phase === "submissions_open" ? undefined : { index: false },
  };
}

function pick(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function DesenPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [query, moment, headerStore] = await Promise.all([searchParams, campaignMoment(), headers()]);
  // The acquisition channel, as a slug only (no names, no numbers).
  const channel =
    sanitizeEventProps({ channel: pick(query.ch) || pick(query.utm_source) }).channel ?? "";
  const base = appOrigin(headerStore, process.env.APP_URL, process.env.NODE_ENV === "production");
  // "https://xmas.originscafe.ro/" + code: the drawing's future short link.
  const drawingBase = drawingUrl("", campaignEnv(), base);

  return (
    <DrawingSignup
      links={contestDocLinks(campaignEnv())}
      phase={moment.phase}
      channel={channel}
      drawingBase={drawingBase}
      locations={CONTEST_LOCATIONS.map(({ slug, name }) => ({ slug, name }))}
    />
  );
}
