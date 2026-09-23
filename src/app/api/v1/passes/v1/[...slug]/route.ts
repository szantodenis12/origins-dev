import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { Member } from "@/lib/db";
import { memberCard } from "@/lib/card";
import { buildApplePass } from "@/lib/wallet/apple";
import {
  registerDevicePass,
  unregisterDevicePass,
  getSerialNumbersForDevice,
} from "@/lib/wallet/pass-store";

/**
 * Apple sends the pass's own authenticationToken on every web-service call.
 * Checking it stops anyone from walking the serial space and pulling other
 * members' passes.
 *
 * It only warns for now: passes already on people's phones carry a token this
 * server generated, and turning a wrong guess about that into a hard 401
 * would break updates for everyone at once. Watch the logs, and once no
 * `token mismatch` lines appear, set PASSKIT_ENFORCE_AUTH=1 to reject.
 */
function expectedToken(member: Member): string {
  return crypto
    .createHash("sha256")
    .update(`${member.id}-${member.passSerial}-secret`)
    .digest("hex")
    .substring(0, 32);
}

function checkAuth(request: Request, member: Member, serial: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const presented = header.replace(/^ApplePass\s+/i, "").trim();
  if (presented === expectedToken(member)) return true;

  console.warn(
    `[passkit-web-service] token mismatch for serial ${serial} (presented ${presented ? "a token" : "nothing"})`,
  );
  return process.env.PASSKIT_ENFORCE_AUTH !== "1";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const url = new URL(request.url);

  console.log(`[passkit-web-service] GET /${slug.join("/")}`);

  // 1. GET /v1/passes/{passTypeIdentifier}/{serialNumber} -> Fetch updated pass
  if (slug[0] === "passes" && slug.length >= 3) {
    const serial = slug[slug.length - 1];
    const db = getDb();

    const member = await db.findMemberByPassSerial(serial);
    if (!member) {
      console.warn(`[passkit-web-service] Pass not found for serial: ${serial}`);
      return new NextResponse("Pass not found", { status: 404 });
    }

    if (!checkAuth(request, member, serial)) {
      return new NextResponse("Unauthorized", { status: 401 });
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

    console.log(`[passkit-web-service] Returning fresh pass for serial ${serial}`);
    return new NextResponse(Buffer.from(pkpassBuffer) as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `inline; filename="Origins-${serial}.pkpass"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Last-Modified": new Date().toUTCString(),
      },
    });
  }

  // 2. GET /v1/devices/{deviceId}/registrations/{passTypeId} -> Get updated serials for device
  if (slug[0] === "devices" && slug.includes("registrations")) {
    const deviceId = slug[1];
    const passTypeId = slug[slug.length - 1];
    const passesUpdatedSince = url.searchParams.get("passesUpdatedSince") || undefined;

    const result = await getSerialNumbersForDevice(
      deviceId,
      passTypeId,
      passesUpdatedSince,
    );

    if (!result.serialNumbers || result.serialNumbers.length === 0) {
      return new NextResponse(null, { status: 204 });
    }

    return NextResponse.json(result);
  }

  return new NextResponse("Not Found", { status: 404 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  console.log(`[passkit-web-service] POST /${slug.join("/")}`);

  // 1. POST /v1/devices/{deviceId}/registrations/{passTypeId}/{serial} -> Register device
  if (slug[0] === "devices" && slug.includes("registrations") && slug.length >= 5) {
    const deviceId = slug[1];
    const passTypeId = slug[3];
    const serial = slug[4];

    try {
      const body = await request.json();
      const pushToken = body?.pushToken;

      if (!pushToken) {
        return new NextResponse("Missing pushToken", { status: 400 });
      }

      await registerDevicePass(deviceId, passTypeId, serial, pushToken);
      console.log(`[passkit-web-service] Successfully registered device ${deviceId} for pass ${serial}`);

      return new NextResponse(null, { status: 201 });
    } catch (err) {
      console.error("[passkit-web-service] Registration error:", err);
      return new NextResponse("Registration failed", { status: 500 });
    }
  }

  // 2. POST /v1/log -> Diagnostics log
  if (slug[0] === "log") {
    try {
      const body = await request.json();
      console.log("[passkit-client-log]", JSON.stringify(body));
    } catch {}
    return new NextResponse(null, { status: 200 });
  }

  return new NextResponse("Not Found", { status: 404 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  console.log(`[passkit-web-service] DELETE /${slug.join("/")}`);

  // DELETE /v1/devices/{deviceId}/registrations/{passTypeId}/{serial} -> Unregister device
  if (slug[0] === "devices" && slug.includes("registrations") && slug.length >= 5) {
    const deviceId = slug[1];
    const passTypeId = slug[3];
    const serial = slug[4];

    try {
      await unregisterDevicePass(deviceId, passTypeId, serial);
      console.log(`[passkit-web-service] Unregistered device ${deviceId} for pass ${serial}`);

      return new NextResponse(null, { status: 200 });
    } catch (err) {
      console.error("[passkit-web-service] Unregistration error:", err);
      return new NextResponse("Unregistration failed", { status: 500 });
    }
  }

  return new NextResponse("Not Found", { status: 404 });
}
