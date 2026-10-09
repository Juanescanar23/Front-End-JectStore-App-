import { NextResponse } from "next/server";
import { resolveCodCheckoutConfig } from "@/utils/server/cod-config";
import { getRuntimeHost } from "@/utils/server/tenant-runtime";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const productId = Number(url.searchParams.get("product_id"));

    if (!Number.isFinite(productId) || productId <= 0) {
      return NextResponse.json(
        {
          error: "`product_id` es obligatorio y debe ser numérico.",
        },
        { status: 400 },
      );
    }

    const runtimeHost = await getRuntimeHost();
    const config = await resolveCodCheckoutConfig(runtimeHost, productId);

    if (!config.allowed_by_plan) {
      return NextResponse.json(
        {
          ...config,
          error: "Tu plan no tiene habilitado pago contraentrega.",
        },
        { status: 403 },
      );
    }

    return NextResponse.json(config, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error inesperado",
      },
      { status: 500 },
    );
  }
}
