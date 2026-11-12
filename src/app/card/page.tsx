import type { Metadata } from "next";
import { cookies } from "next/headers";
import CardView from "@/components/CardView";
import { getDb } from "@/lib/db";
import { isMemberId, MEMBER_COOKIE } from "@/lib/member-cookie";
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

/**
 * The card this browser already opened (lib/member-cookie.ts), if the member
 * still exists. It shows nothing this device could not reach through its own
 * history — the id in the cookie is the same one that is in the URL there.
 * A card the manager blocked still comes back: the card page says so, which
 * beats telling a member they were never enrolled.
 */
async function rememberedMember(): Promise<{
  memberId: string;
  name: string;
} | null> {
  const id = (await cookies()).get(MEMBER_COOKIE)?.value;
  if (!id || !isMemberId(id)) return null;

  const member = await getDb().getMember(id);
  return member ? { memberId: member.id, name: member.name } : null;
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

  const [config, returning] = await Promise.all([
    getDb().getLoyaltyConfig(),
    rememberedMember(),
  ]);

  return (
    <CardView
      student={student}
      returning={returning}
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
