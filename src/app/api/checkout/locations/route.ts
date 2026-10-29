import { NextResponse } from "next/server";
import { getCheckoutLocations } from "@/utils/server/checkout-locations";
import { getRuntimeHost } from "@/utils/server/tenant-runtime";

export async function GET() {
  try {
    const data = await getCheckoutLocations(await getRuntimeHost());
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ message: "No pudimos cargar los países y estados. Vuelve a intentarlo." }, {
      status: 503, headers: { "Cache-Control": "private, no-store" },
    });
  }
}
