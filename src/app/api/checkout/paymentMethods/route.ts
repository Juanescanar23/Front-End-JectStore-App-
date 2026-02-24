import { bagistoFetch } from "@/utils/bagisto";
import { isBagistoError } from "@/utils/type-guards";
import { flattenShippingMethods } from "@/app/api/_lib/cart-compat";

const CART_DETAIL_QUERY = `
  query CartDetailForPaymentMethods {
    cartDetail {
      shippingMethod
      selectedShippingRate {
        method
      }
    }
  }
`;

const SHIPPING_METHODS_QUERY = `
  query ShippingMethodsForPaymentFallback {
    shippingMethods {
      shippingMethods {
        title
        methods {
          code
          label
          price
          formattedPrice
        }
      }
    }
  }
`;

const PAYMENT_METHODS_QUERY = `
  query PaymentMethods($input: PaymentMethodsInput!) {
    paymentMethods(input: $input) {
      message
      paymentMethods {
        method
        methodTitle
        description
        image
      }
    }
  }
`;

const resolveShippingMethod = async (bodyMethod?: string) => {
  if (bodyMethod) return bodyMethod;

  const cartDetailResponse = await bagistoFetch<any>({
    query: CART_DETAIL_QUERY,
    cache: "no-store",
  });

  const cartMethod =
    cartDetailResponse?.body?.data?.cartDetail?.selectedShippingRate?.method ??
    cartDetailResponse?.body?.data?.cartDetail?.shippingMethod ??
    "";

  if (cartMethod) return String(cartMethod);

  const shippingMethodsResponse = await bagistoFetch<any>({
    query: SHIPPING_METHODS_QUERY,
    cache: "no-store",
  });

  const groups =
    shippingMethodsResponse?.body?.data?.shippingMethods?.shippingMethods ?? [];

  return flattenShippingMethods(groups)?.[0]?.method ?? "";
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const shippingMethod = await resolveShippingMethod(body?.shippingMethod);

    if (!shippingMethod) {
      return Response.json({ data: [] }, { status: 200 });
    }

    const response = await bagistoFetch<any>({
      query: PAYMENT_METHODS_QUERY,
      variables: {
        input: {
          shippingMethod,
        },
      },
      cache: "no-store",
    });

    const methods = response?.body?.data?.paymentMethods?.paymentMethods ?? [];

    return Response.json(
      {
        data: Array.isArray(methods)
          ? methods.map((method: any, index: number) => ({
              id: index + 1,
              method: method?.method ?? "",
              title: method?.methodTitle ?? method?.method ?? "",
              description: method?.description ?? "",
              icon: method?.image ?? null,
              isAllowed: true,
            }))
          : [],
      },
      { status: 200 },
    );
  } catch (error) {
    if (isBagistoError(error)) {
      return Response.json(
        {
          data: { collectionPaymentMethods: null },
          error,
        },
        { status: 200 },
      );
    }

    return Response.json(
      {
        message: "Network error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
