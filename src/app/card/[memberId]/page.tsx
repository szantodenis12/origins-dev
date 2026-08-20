import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import WebCard from "@/components/WebCard";
import { formatBucharestDate } from "@/app/admin/push/shared";
import { getDb } from "@/lib/db";
import { memberCard } from "@/lib/card";
import { doubleStampText } from "@/lib/program";
import { birthdayCardLine } from "@/lib/program-copy";
import { reviewUrlForMember } from "@/lib/review";
import { reviewIntentAction } from "./actions";
import { getGoogleWalletSaveUrl } from "@/lib/wallet/google";

/**
 * The member's web card (faza 2.5). The unguessable memberId in the URL is
 * the whole access control — so this page must never be indexed, and the id
 * is a UUID, never sequential. Wallet buttons join here in phase 3.
 */

export const metadata: Metadata = {
  title: "Cardul Origins",
  robots: { index: false, follow: false },
};

export default async function MemberCardPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  const db = getDb();

  const member = await db.getMember(memberId);
  if (!member) notFound();

  const [config, stamps, redemptions, reviewUrl] = await Promise.all([
    db.getLoyaltyConfig(),
    db.getMemberStamps(member.id),
    db.getMemberRedemptions(member.id),
    reviewUrlForMember(db, member.id),
  ]);

  // One resolution of the member's standing (lib/card.ts): Gold decides the
  // card, the card decides what is earned. The page only renders it.
  const card = memberCard(stamps, redemptions, config, new Date(), {
    day: member.birthDay,
    month: member.birthMonth,
    year: member.birthYear,
  });
  const { gold } = card;

  // The QR carries the bare pass serial — exactly what the barista scanner
  // expects, and what the phase-3 wallet passes will carry too.
  const qrSvg = await QRCode.toString(member.passSerial, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: {
      dark: gold.isGold ? "#3d3517" : member.isStudent ? "#1c1d1a" : "#283e1c",
      light: "#ffffff",
    },
  });

  return (
    <WebCard
      name={member.name}
      serial={member.passSerial}
      isStudent={member.isStudent}
      studentVerified={member.studentVerifiedAt !== null}
      blocked={member.blockedAt !== null}
      progress={card.progress}
      cycleLength={card.spec.cycleLength}
      midRewardAt={
        config.midReward.enabled ? config.midReward.stampsRequired : null
      }
      // The plate's reward block is about the stamp card only: a Gold perk is
      // not "cardul e plin", and saying so on the face would be a lie.
      hasReward={card.cardRewards.length > 0}
      gold={{
        isGold: gold.isGold,
        expiresAt: gold.expiresAt,
        completedCards: gold.completedCards,
        cardsRequired: gold.cardsRequired,
        everGold: gold.everGold,
      }}
      // Date only: the member reads a deadline, not a timestamp — "17.08.2026
      // · 10:43 păstrează statutul" reads like a bug in the middle of a
      // sentence. The exact instant stays in the admin, where it is operational.
      goldExpiresLabel={
        gold.expiresAt ? formatBucharestDate(gold.expiresAt) : null
      }
      perk={
        card.perk
          ? {
              name: config.names[card.perk.period.perk],
              toGoOnly: card.perk.period.toGoOnly,
              used: card.perk.usedAt !== null,
              untilLabel: formatBucharestDate(card.perk.period.endsAt),
            }
          : null
      }
      birthdayText={
        card.birthdayAvailable ? birthdayCardLine(config) : null
      }
      doubleStampText={doubleStampText(config.doubleStamp)}
      qrSvg={qrSvg}
      // Once the bonus stamp was granted, the invitation has done its job.
      // No review URL anywhere yet = no link, never a dead one.
      reviewAction={
        !member.reviewBonusGiven && reviewUrl
          ? reviewIntentAction.bind(null, member.id)
          : null
      }
      applePassUrl={`/api/v1/passes/${member.passSerial}`}
      googleWalletUrl={getGoogleWalletSaveUrl(member, card)}
    />
  );
}
