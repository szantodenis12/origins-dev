import { NextResponse } from "next/server";
import { registerDevicePass, unregisterDevicePass } from "@/lib/wallet/pass-store";

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      deviceId: string;
      passTypeId: string;
      serial: string;
    }>;
  },
) {
  const { deviceId, passTypeId, serial } = await params;

  try {
    const body = await request.json();
    const pushToken = body?.pushToken;

    if (!pushToken) {
      return new NextResponse("Missing pushToken", { status: 400 });
    }

    await registerDevicePass(deviceId, passTypeId, serial, pushToken);
    console.log(`[passkit-api] Registered device ${deviceId} for serial ${serial}`);

    return new NextResponse(null, { status: 201 });
  } catch (err) {
    console.error("[passkit-api] POST registration error:", err);
    return new NextResponse("Registration failed", { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      deviceId: string;
      passTypeId: string;
      serial: string;
    }>;
  },
) {
  const { deviceId, passTypeId, serial } = await params;

  try {
    await unregisterDevicePass(deviceId, passTypeId, serial);
    console.log(`[passkit-api] Unregistered device ${deviceId} for serial ${serial}`);

    return new NextResponse(null, { status: 200 });
  } catch (err) {
    console.error("[passkit-api] DELETE registration error:", err);
    return new NextResponse("Unregistration failed", { status: 500 });
  }
}
