import { GET_CHECKOUT_PAYMENT_METHODS } from "@/graphql";
import { CHECKOUT_WHATSAPP_AVAILABILITY } from "@/graphql/checkout/whatsapp-order";
import { storefrontUnavailableResponse } from "@/utils/server/storefront-unavailable";
import { CheckoutPaymentMethodsOperation } from "@/types/checkout/type";
import { bagistoFetch } from "@/utils/bagisto";
import { isBagistoError } from "@/utils/type-guards";
import { getAuthToken } from "@/utils/helper";
import { WHATSAPP_ORDER_METHOD, WHATSAPP_ORDER_TITLE } from "@/utils/whatsapp-order";

export async function POST(req: Request) {
  try {
    const guestToken = getAuthToken(req);

    const response = await bagistoFetch<CheckoutPaymentMethodsOperation>({
      query: GET_CHECKOUT_PAYMENT_METHODS,
      variables: { token: "" } as any,
      cache: "no-store",
      guestToken,
    });

    const methods = response.body.data?.collectionPaymentMethods;
    if (Array.isArray(methods)) {
      const availability = await bagistoFetch<{ data?: { storefrontWhatsAppOrderAvailable?: boolean } }>({
        query: CHECKOUT_WHATSAPP_AVAILABILITY,
        cache: "no-store",
        guestToken,
      }).catch(() => null);
      if (availability?.body.data?.storefrontWhatsAppOrderAvailable === true) {
        return Response.json({
          data: [...methods, {
            id: WHATSAPP_ORDER_METHOD, method: WHATSAPP_ORDER_METHOD, title: WHATSAPP_ORDER_TITLE,
            description: "Coordina el pago y la entrega con la tienda.", isAllowed: true,
          }],
        }, { headers: { "Cache-Control": "private, no-store" } });
      }
    }

    return Response.json(
      {
        data: response?.body?.data?.collectionPaymentMethods,
      },
      { status: 200 }
    );
  } catch (error) {
    const unavailable = storefrontUnavailableResponse(error);
    if (unavailable) return unavailable;
    if (isBagistoError(error)) {
      return Response.json(
        {
          data: { collectionPaymentMethods: null },
          error: error.cause ?? error,
        },
        { status: 200 }
      );
    }

    return Response.json(
      {
        message: "Network error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
