import { NextResponse } from "next/server";
import { isCodFeatureEnabledForPlan } from "@/utils/server/cod-feature-gate";
import {
  getPortalCodSettings,
  markPortalCodOrderAsPaid,
} from "@/utils/server/cod-portal";
import { getRuntimeHost } from "@/utils/server/tenant-runtime";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const params = await context.params;
    const orderId = String(params?.id || "").trim();

    if (!orderId) {
      return NextResponse.json(
        {
          error: "`id` es obligatorio.",
        },
        { status: 400 },
      );
    }

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

    const order = await markPortalCodOrderAsPaid(runtimeHost, orderId);

    if (!order) {
      return NextResponse.json(
        {
          error: "Orden no encontrada.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ order }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error inesperado",
      },
      { status: 500 },
    );
  }
}
