import { NextResponse } from "next/server";
import { CodOffer } from "@/types/cod";
import { isCodFeatureEnabledForPlan } from "@/utils/server/cod-feature-gate";
import {
  deletePortalCodOffer,
  getPortalCodSettings,
  listPortalCodOffers,
  updatePortalCodOffer,
} from "@/utils/server/cod-portal";
import { getRuntimeHost } from "@/utils/server/tenant-runtime";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const params = await context.params;
    const offerId = Number(params?.id);

    if (!Number.isFinite(offerId) || offerId <= 0) {
      return NextResponse.json(
        {
          error: "`id` inválido.",
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

    const offers = await listPortalCodOffers(runtimeHost);
    const offer = offers.find((item) => item.id === offerId) || null;

    if (!offer) {
      return NextResponse.json(
        {
          error: "Oferta no encontrada.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ offer }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error inesperado",
      },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const params = await context.params;
    const offerId = Number(params?.id);

    if (!Number.isFinite(offerId) || offerId <= 0) {
      return NextResponse.json(
        {
          error: "`id` inválido.",
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

    const body = (await req.json()) as Partial<CodOffer>;
    const offer = await updatePortalCodOffer(runtimeHost, offerId, body);

    if (!offer) {
      return NextResponse.json(
        {
          error: "Oferta no encontrada.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ offer }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error inesperado",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const params = await context.params;
    const offerId = Number(params?.id);

    if (!Number.isFinite(offerId) || offerId <= 0) {
      return NextResponse.json(
        {
          error: "`id` inválido.",
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

    const deleted = await deletePortalCodOffer(runtimeHost, offerId);

    if (!deleted) {
      return NextResponse.json(
        {
          error: "Oferta no encontrada.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error inesperado",
      },
      { status: 500 },
    );
  }
}
