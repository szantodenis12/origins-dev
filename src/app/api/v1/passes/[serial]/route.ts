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

  return new NextResponse(pkpassBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="Origins-${serial}.pkpass"`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
