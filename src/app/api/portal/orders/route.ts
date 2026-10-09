import { NextResponse } from "next/server";
import { isCodFeatureEnabledForPlan } from "@/utils/server/cod-feature-gate";
import {
  getPortalCodSettings,
  listPortalCodOrders,
} from "@/utils/server/cod-portal";
import { getRuntimeHost } from "@/utils/server/tenant-runtime";

export async function GET() {
  try {
    const runtimeHost = await getRuntimeHost();
    const settings = await getPortalCodSettings(runtimeHost);

    if (!isCodFeatureEnabledForPlan(settings.plan_name)) {
      return NextResponse.json(
        {
          orders: [],
          error: "Tu plan no tiene habilitado pago contraentrega.",
        },
        { status: 403 },
      );
    }

    const orders = await listPortalCodOrders(runtimeHost);

    return NextResponse.json({ orders }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        orders: [],
        error: error instanceof Error ? error.message : "Error inesperado",
      },
      { status: 500 },
    );
  }
}
