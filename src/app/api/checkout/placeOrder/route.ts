import { NextResponse } from "next/server";
import { storefrontUnavailableResponse } from "@/utils/server/storefront-unavailable";
import { experienceRequestAuthority } from "@/lib/storefront-experience/runtime";
import { CREATE_CHECKOUT_ORDER } from "@/graphql";
import { CREATE_WHATSAPP_ORDER } from "@/graphql/checkout/whatsapp-order";
import { bagistoFetch } from "@utils/bagisto";
import { isBagistoError } from "@utils/type-guards";
import { CreateCheckoutOrderOperation } from "@/types/checkout/type";
import { getAuthToken } from "@/utils/helper";
import { isWhatsAppOrderId, parseWhatsAppOrder, WHATSAPP_RECEIPT_COOKIE, WHATSAPP_RECEIPT_PATH } from "@/utils/whatsapp-order";

function isSameStorefrontOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const authority = experienceRequestAuthority(request.headers.get("host"));
    // The checkout ingress overwrites this header with its own scheme.
    const scheme = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.slice(0, -1);
    if (scheme !== "http" && scheme !== "https") return false;
    return origin === new URL(scheme + "://" + authority).origin;
  } catch {
    return false;
  }
}

async function placeWhatsAppOrder(req: Request, input: Record<string, unknown>) {
  const privateHeaders = { "Cache-Control": "private, no-store" };
  if (!isSameStorefrontOrigin(req)
    || req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ message: "No pudimos verificar esta solicitud." }, { status: 403, headers: privateHeaders });
  }

  const cartId = input.whatsappCartId;
  if (Object.keys(input).length !== 1 || !isWhatsAppOrderId(cartId)) {
    return NextResponse.json({ message: "No encontramos el carrito." }, { status: 400, headers: privateHeaders });
  }

  try {
    const result = await bagistoFetch<{
      variables: { cartId: number };
      data?: { createWhatsAppOrder?: unknown };
    }>({
      query: CREATE_WHATSAPP_ORDER,
      variables: { cartId },
      guestToken: getAuthToken(req),
      cache: "no-store",
    });
    const data = result.body.data?.createWhatsAppOrder;
    const order = parseWhatsAppOrder(data);
    if (!order) return NextResponse.json({ message: "No pudimos confirmar el pedido." }, { status: 502, headers: privateHeaders });

    const response = NextResponse.json({ whatsappOrder: { id: order.id } }, { headers: privateHeaders });
    const token = (data as { receiptToken?: unknown }).receiptToken;
    if (typeof token === "string" && /^[a-f0-9]{64}$/.test(token)) {
      response.cookies.set(WHATSAPP_RECEIPT_COOKIE, token, {
        httpOnly: true, secure: true, sameSite: "lax", maxAge: 900, path: WHATSAPP_RECEIPT_PATH,
      });
    }
    return response;
  } catch (error) {
    const unavailable = storefrontUnavailableResponse(error);
    if (unavailable) return unavailable;
    return NextResponse.json({
      message: "No pudimos confirmar el pedido. Revisa el carrito e intenta de nuevo.",
    }, { status: 409, headers: privateHeaders });
  }
}

export async function POST(req: Request) {
  try {
    const input: unknown = await req.json().catch(() => null);
    if (input && typeof input === "object" && Object.hasOwn(input, "whatsappCartId")) {
      return await placeWhatsAppOrder(req, input as Record<string, unknown>);
    }
    const guestToken = getAuthToken(req);


    const res = await bagistoFetch<CreateCheckoutOrderOperation>({
      query: CREATE_CHECKOUT_ORDER,
      cache: "no-store",
      guestToken,
    });
    return NextResponse.json({ data: res?.body?.data }, { status: 200 });
  } catch (error) {
    const unavailable = storefrontUnavailableResponse(error);
    if (unavailable) return unavailable;
    if (isBagistoError(error)) {
      return NextResponse.json(
        {
          data: { createCheckoutOrder: null },
          error: error.cause ?? error,
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        message: "Network error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
