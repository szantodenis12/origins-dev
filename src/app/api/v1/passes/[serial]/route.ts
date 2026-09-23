import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { memberCard } from "@/lib/card";
import { buildApplePass } from "@/lib/wallet/apple";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ serial: string }> },
) {
  const { serial } = await params;
  const db = getDb();

  const member = await db.findMemberByPassSerial(serial);
  if (!member) {
    return new NextResponse("Pass not found", { status: 404 });
  }

  const [config, stamps, redemptions] = await Promise.all([
    db.getLoyaltyConfig(),
    db.getMemberStamps(member.id),
    db.getMemberRedemptions(member.id),
  ]);

  const card = memberCard(stamps, redemptions, config, new Date(), {
    day: member.birthDay,
    month: member.birthMonth,
    year: member.birthYear,
  });

  const pkpassBuffer = await buildApplePass(member, card, config);

  return new NextResponse(Buffer.from(pkpassBuffer) as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      // `inline` hands the pass straight to PassKit. As an attachment, iOS
      // Safari files it away in Downloads instead of offering "Add to Apple
      // Wallet", and in-app browsers drop it entirely — so the member never
      // installs the pass and no device ever registers for updates.
      "Content-Disposition": `inline; filename="Origins-${serial}.pkpass"`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
