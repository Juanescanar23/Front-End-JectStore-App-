import { NextResponse } from "next/server";
import { CodTenantSettings } from "@/types/cod";
import { isCodFeatureEnabledForPlan } from "@/utils/server/cod-feature-gate";
import {
  getPortalCodSettings,
  savePortalCodSettings,
} from "@/utils/server/cod-portal";
import { getRuntimeHost } from "@/utils/server/tenant-runtime";

export async function GET() {
  try {
    const runtimeHost = await getRuntimeHost();
    const settings = await getPortalCodSettings(runtimeHost);
    const allowedByPlan = isCodFeatureEnabledForPlan(settings.plan_name);

    if (!allowedByPlan) {
      return NextResponse.json(
        {
          settings,
          allowed_by_plan: false,
          error: "Tu plan no tiene habilitado pago contraentrega.",
        },
        { status: 403 },
      );
    }

    return NextResponse.json(
      {
        settings,
        allowed_by_plan: true,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error inesperado",
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as Partial<CodTenantSettings>;
    const runtimeHost = await getRuntimeHost();

    const current = await getPortalCodSettings(runtimeHost);
    const allowedByPlan = isCodFeatureEnabledForPlan(
      body.plan_name || current.plan_name,
    );

    if (!allowedByPlan) {
      return NextResponse.json(
        {
          error: "Tu plan no tiene habilitado pago contraentrega.",
        },
        { status: 403 },
      );
    }

    const settings = await savePortalCodSettings(runtimeHost, body);

    return NextResponse.json(
      {
        settings,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error inesperado",
      },
      { status: 500 },
    );
  }
}
