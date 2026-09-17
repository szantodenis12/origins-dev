import { NextResponse } from "next/server";
import { listAllRegistrations } from "@/lib/wallet/pass-store";

export async function GET() {
  try {
    const regs = await listAllRegistrations();
    return NextResponse.json({
      status: "ok",
      deviceCount: regs.length,
      registrations: regs.map((r) => ({
        deviceId: r.deviceId,
        passTypeId: r.passTypeId,
        serialNumber: r.serialNumber,
        pushTokenPrefix: r.pushToken.substring(0, 10) + "...",
        updatedAt: r.updatedAt,
      })),
      env: {
        hasAppleCert: Boolean(process.env.APPLE_CERT_P12_BASE64),
        appleTeamId: process.env.APPLE_TEAM_ID || "B6WGU5CX63",
        applePassTypeId: process.env.APPLE_PASS_TYPE_ID || "pass.ro.originscafe.circle",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ status: "error", message: err?.message }, { status: 500 });
  }
}
