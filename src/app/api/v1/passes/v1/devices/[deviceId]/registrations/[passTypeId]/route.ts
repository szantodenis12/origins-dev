import { NextResponse } from "next/server";
import { getSerialNumbersForDevice } from "@/lib/wallet/pass-store";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      deviceId: string;
      passTypeId: string;
    }>;
  },
) {
  const { deviceId, passTypeId } = await params;
  const { searchParams } = new URL(request.url);
  const passesUpdatedSince = searchParams.get("passesUpdatedSince") || undefined;

  try {
    const result = await getSerialNumbersForDevice(
      deviceId,
      passTypeId,
      passesUpdatedSince,
    );

    if (!result.serialNumbers || result.serialNumbers.length === 0) {
      return new NextResponse(null, { status: 204 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[passkit-api] GET serials error:", err);
    return new NextResponse(null, { status: 500 });
  }
}
