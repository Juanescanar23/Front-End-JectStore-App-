import { NextResponse } from "next/server";
import { getLocationCities } from "@/utils/server/locations";
import { getRuntimeHost } from "@/utils/server/tenant-runtime";

export async function GET(
  req: Request,
  context: { params: Promise<{ country: string }> | { country: string } },
) {
  try {
    const params = await context.params;
    const country = String(params?.country || "").trim().toUpperCase();

    if (!country) {
      return NextResponse.json(
        {
          cities: [],
          error: "`country` es obligatorio.",
        },
        { status: 400 },
      );
    }

    const url = new URL(req.url);
    const regionId = String(url.searchParams.get("region_id") || "").trim();

    const runtimeHost = await getRuntimeHost();
    const cities = await getLocationCities(runtimeHost, country, regionId || undefined);

    return NextResponse.json(
      {
        cities,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        cities: [],
        error: error instanceof Error ? error.message : "Error inesperado",
      },
      { status: 500 },
    );
  }
}
