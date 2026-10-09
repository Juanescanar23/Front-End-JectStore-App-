import { NextResponse } from "next/server";
import { CodOffer } from "@/types/cod";
import { isCodFeatureEnabledForPlan } from "@/utils/server/cod-feature-gate";
import {
  createPortalCodOffer,
  getPortalCodSettings,
  listPortalCodOffers,
} from "@/utils/server/cod-portal";
import { getRuntimeHost } from "@/utils/server/tenant-runtime";

export async function GET(req: Request) {
  try {
    const runtimeHost = await getRuntimeHost();
    const settings = await getPortalCodSettings(runtimeHost);

    if (!isCodFeatureEnabledForPlan(settings.plan_name)) {
      return NextResponse.json(
        {
          offers: [],
          error: "Tu plan no tiene habilitado pago contraentrega.",
        },
        { status: 403 },
      );
    }

    const url = new URL(req.url);
    const productId = Number(url.searchParams.get("product_id"));
    const offers = await listPortalCodOffers(
      runtimeHost,
      Number.isFinite(productId) && productId > 0 ? productId : undefined,
    );

    return NextResponse.json({ offers }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        offers: [],
        error: error instanceof Error ? error.message : "Error inesperado",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const runtimeHost = await getRuntimeHost();
    const settings = await getPortalCodSettings(runtimeHost);

    if (!isCodFeatureEnabledForPlan(settings.plan_name)) {
      return NextResponse.json(
        {
          error: "Tu plan no tiene habilitado pago contraentrega.",
        },
        { status: 403 },
      );
    }

    const body = (await req.json()) as Partial<CodOffer>;

    if (!Number.isFinite(Number(body.product_id)) || Number(body.product_id) <= 0) {
      return NextResponse.json(
        {
          error: "`product_id` es obligatorio.",
        },
        { status: 400 },
      );
    }

    if (!body.title || String(body.title).trim() === "") {
      return NextResponse.json(
        {
          error: "`title` es obligatorio.",
        },
        { status: 400 },
      );
    }

    if (!Number.isFinite(Number(body.price)) || Number(body.price) <= 0) {
      return NextResponse.json(
        {
          error: "`price` es obligatorio y debe ser > 0.",
        },
        { status: 400 },
      );
    }

    const offer = await createPortalCodOffer(runtimeHost, {
      ...body,
      product_id: Number(body.product_id),
      price: Number(body.price),
      units_count: Math.max(1, Number(body.units_count || 1)),
    });

    return NextResponse.json({ offer }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error inesperado",
      },
      { status: 500 },
    );
  }
}
