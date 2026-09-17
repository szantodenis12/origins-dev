import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("[passkit-log]", JSON.stringify(body));
  } catch {}
  return new NextResponse(null, { status: 200 });
}
