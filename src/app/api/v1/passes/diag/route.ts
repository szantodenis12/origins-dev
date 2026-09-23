import { NextResponse } from "next/server";
import { listAllRegistrations } from "@/lib/wallet/pass-store";
import { probeApns } from "@/lib/wallet/apns";
import { getDb } from "@/lib/db";
import { memberCard } from "@/lib/card";
import {
  googleWalletConfigured,
  getWalletAccessToken,
} from "@/lib/wallet/google-auth";
import { inspectGoogleObject } from "@/lib/wallet/google-api";
import { loyaltyClassId, tierKeyFor } from "@/lib/wallet/google";

/**
 * What the two wallets currently know.
 *
 * `?serial=ORIG-XXXX-XXXX` also reports what Google holds for that one member,
 * which is the quickest way to tell "the update never fired" apart from "the
 * member never saved the card".
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const serial = url.searchParams.get("serial");

    const regs = await listAllRegistrations();
    const db = getDb();
    const members = await db.listMembers();
    const registeredSerials = new Set(regs.map((r) => r.serialNumber));

    const body: Record<string, unknown> = {
      status: "ok",
      apple: {
        deviceCount: regs.length,
        // The gap that matters: members who earn stamps but have no device
        // listening, so no push is even attempted for them.
        membersTotal: members.length,
        membersWithDevice: members.filter((m) =>
          registeredSerials.has(m.passSerial),
        ).length,
        registrations: regs.map((r) => ({
          deviceId: r.deviceId,
          passTypeId: r.passTypeId,
          serialNumber: r.serialNumber,
          pushTokenPrefix: r.pushToken.substring(0, 10) + "...",
          updatedAt: r.updatedAt,
        })),
      },
      // Whether APNs accepts our headers at all. Without it, a rejected
      // header looks exactly like "nobody had their phone on".
      apns: await probeApns(),
      google: {
        configured: googleWalletConfigured(),
        tokenOk: googleWalletConfigured()
          ? (await getWalletAccessToken()) !== null
          : false,
      },
      env: {
        hasAppleCert: Boolean(process.env.APPLE_CERT_P12_BASE64),
        appleTeamId: process.env.APPLE_TEAM_ID || "B6WGU5CX63",
        applePassTypeId:
          process.env.APPLE_PASS_TYPE_ID || "pass.ro.originscafe.circle",
        appUrl: process.env.NEXT_PUBLIC_APP_URL || "(default)",
        hasCronSecret: Boolean(process.env.CRON_SECRET),
      },
    };

    if (serial) {
      const member = await db.findMemberByPassSerial(serial);
      if (!member) {
        body.member = { serial, found: false };
      } else {
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
        const tier = tierKeyFor(member, card);
        body.member = {
          serial,
          found: true,
          tier,
          expected: {
            classId: loyaltyClassId(tier),
            balance: `${Math.min(card.progress, card.spec.cycleLength)} / ${card.spec.cycleLength}`,
          },
          appleDevices: regs.filter((r) => r.serialNumber === serial).length,
          google: await inspectGoogleObject(member),
        };
      }
    }

    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: (err as Error)?.message },
      { status: 500 },
    );
  }
}
