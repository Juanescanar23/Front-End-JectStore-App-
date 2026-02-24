import { NextResponse } from "next/server";
import { bagistoFetch } from "@/utils/bagisto";
import { isBagistoError } from "@/utils/type-guards";

const PLACE_ORDER_MUTATION = `
  mutation PlaceOrder {
    placeOrder {
      success
      redirectUrl
      selectedMethod
      order {
        id
        incrementId
      }
    }
  }
`;

export async function POST() {
  try {
    const response = await bagistoFetch<any>({
      query: PLACE_ORDER_MUTATION,
      cache: "no-store",
    });

    const payload = response?.body?.data?.placeOrder;

    if (!payload?.success || !payload?.order?.id) {
      return NextResponse.json(
        {
          data: { createCheckoutOrder: null },
          error: {
            message: "No se pudo finalizar la orden.",
            payload,
          },
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        data: {
          createCheckoutOrder: {
            checkoutOrder: {
              id: Number(payload.order.id),
              orderId: Number(payload.order.id),
              incrementId: payload.order.incrementId,
            },
          },
        },
      },
      { status: 200 },
    );
  } catch (error) {
    if (isBagistoError(error)) {
      return NextResponse.json(
        {
          data: { createCheckoutOrder: null },
          error,
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
