import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LocationView from "@/components/LocationView";
import { locations as seedLocations } from "@/lib/data";
import { getDb } from "@/lib/db";
import { forPublic } from "@/lib/hours";
import { productsForLocation, seasonalHero } from "@/lib/menu";
import { doubleStampText } from "@/lib/program";
import { cardSummary } from "@/lib/program-copy";

// Same reason as on "/": the manager edits the menu and can add locations,
// so both page data and metadata read the Db. Seed slugs are only a build hint;
// force-dynamic keeps newly created slugs available without a rebuild.
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return seedLocations.map((location) => ({ locatie: location.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locatie: string }>;
}): Promise<Metadata> {
  const { locatie } = await params;
  const location = await getDb().getLocationBySlug(locatie);
  if (!location) return {};

  return {
    title: `Origins ${location.name}`,
    description: `Meniul, programul și cardul de fidelitate Origins la ${location.name}.`,
  };
}

export default async function LocationPage({
  params,
}: {
  params: Promise<{ locatie: string }>;
}) {
  const { locatie } = await params;
  const db = getDb();
  const location = await db.getLocationBySlug(locatie);

  if (!location) notFound();

  const [categories, allProducts, config] = await Promise.all([
    db.listCategories(),
    db.listProducts(),
    db.getLoyaltyConfig(),
  ]);
  const products = productsForLocation(allProducts, location);

  return (
    <LocationView
      // Seasonal cafenele show the month the visitor is in (lib/hours).
      location={forPublic(location)}
      categories={categories}
      products={products}
      seasonal={seasonalHero(products)}
      // The loyalty block states the program as configured, not as coded.
      loyalty={{
        summary: cardSummary(config),
        cycleLength: config.cycleLength,
        midRewardAt: config.midReward.enabled
          ? config.midReward.stampsRequired
          : null,
        doubleStampText: doubleStampText(config.doubleStamp),
      }}
    />
  );
}
