import type { Metadata } from "next";
import CardView from "@/components/CardView";
import { getDb } from "@/lib/db";
import { doubleStampText } from "@/lib/program";
import { cardSummary } from "@/lib/program-copy";

// The signup page states the current deal, so it reads the program settings
// like every other public page.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getDb().getLoyaltyConfig();
  return {
    title: "Cardul Origins",
    description: `Cardul de fidelitate Origins: ${cardSummary(config).ro}`,
  };
}

export default async function CardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const raw = query.student;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const student = value === "1" || value === "true";

  const config = await getDb().getLoyaltyConfig();

  return (
    <CardView
      student={student}
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
