import { NextResponse } from "next/server";
import { getLocationRegions } from "@/utils/server/locations";
import { getRuntimeHost } from "@/utils/server/tenant-runtime";

export async function GET(
  _req: Request,
  context: { params: Promise<{ country: string }> | { country: string } },
) {
  try {
    const params = await context.params;
    const country = String(params?.country || "").trim().toUpperCase();

    if (!country) {
      return NextResponse.json(
        {
          regions: [],
          error: "`country` es obligatorio.",
        },
        { status: 400 },
      );
    }

    const runtimeHost = await getRuntimeHost();
    const regions = await getLocationRegions(runtimeHost, country);

    return NextResponse.json(
      {
        regions,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        regions: [],
        error: error instanceof Error ? error.message : "Error inesperado",
      },
      { status: 500 },
    );
  }
}
