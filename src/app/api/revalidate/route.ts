import { NextResponse } from "next/server";

// Only the internal HMAC endpoint may invalidate registered tenant host tags.
export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ revalidated: false, message: "Legacy endpoint retired." }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
