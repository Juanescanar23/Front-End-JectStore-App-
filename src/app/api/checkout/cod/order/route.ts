import { NextResponse } from "next/server";
import { storefrontUnavailableResponse } from "@/utils/server/storefront-unavailable";
import { CodOrderRequestBody } from "@/types/cod";
import { processCodOrder } from "@/utils/server/cod-order";
import { getRuntimeHost } from "@/utils/server/tenant-runtime";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CodOrderRequestBody;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Body inválido" },
        { status: 400 },
      );
    }

    if (body.mode !== "single" && body.mode !== "offer") {
      return NextResponse.json(
        { error: "`mode` debe ser `single` o `offer`." },
        { status: 400 },
      );
    }

    if (!Number.isFinite(Number(body.product_id)) || Number(body.product_id) <= 0) {
      return NextResponse.json(
        { error: "`product_id` es obligatorio y debe ser numérico." },
        { status: 400 },
      );
    }

    if (!body.shipping_address || typeof body.shipping_address !== "object") {
      return NextResponse.json(
        { error: "`shipping_address` es obligatorio." },
        { status: 400 },
      );
    }

    const runtimeHost = await getRuntimeHost();

    const result = await processCodOrder(runtimeHost, {
      ...body,
      product_id: Number(body.product_id),
      offer_id:
        body.offer_id === undefined || body.offer_id === null
          ? undefined
          : Number(body.offer_id),
      units_count: Number(body.units_count || 0),
    });

    if (!result.ok || !result.data) {
      return NextResponse.json(
        {
          error: result.message || "No se pudo crear la orden COD.",
        },
        { status: result.status || 500 },
      );
    }

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    const unavailable = storefrontUnavailableResponse(error);
    if (unavailable) return unavailable;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error inesperado",
      },
      { status: 500 },
    );
  }
}
