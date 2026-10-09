import { NextResponse } from "next/server";
import { getLocationCountries } from "@/utils/server/locations";
import { getRuntimeHost } from "@/utils/server/tenant-runtime";

export async function GET() {
  try {
    const runtimeHost = await getRuntimeHost();
    const countries = await getLocationCountries(runtimeHost);

    return NextResponse.json(
      {
        countries,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        countries: [],
        error: error instanceof Error ? error.message : "Error inesperado",
      },
      { status: 500 },
    );
  }
}
