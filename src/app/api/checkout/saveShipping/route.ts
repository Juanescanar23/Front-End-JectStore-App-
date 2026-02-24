import { NextResponse } from "next/server";
import { bagistoFetch } from "@/utils/bagisto";
import { isBagistoError } from "@/utils/type-guards";

const SAVE_SHIPPING_MUTATION = `
  mutation SaveShipping($input: saveShippingMethodInput!) {
    saveShipping(input: $input) {
      message
      jumpToSection
      cart {
        id
        shippingMethod
      }
    }
  }
`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const shippingMethod = String(body?.shippingMethod ?? body?.method ?? "");

    const response = await bagistoFetch<any>({
      query: SAVE_SHIPPING_MUTATION,
      variables: {
        input: {
          method: shippingMethod,
        },
      },
      cache: "no-store",
    });

    const payload = response?.body?.data?.saveShipping;

    return NextResponse.json(
      {
        data: {
          createCheckoutShippingMethod: {
            checkoutShippingMethod: {
              success: Boolean(payload),
              id: Number(payload?.cart?.id ?? 0),
              message: payload?.message ?? "",
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
          data: { saveShipping: null },
          error,
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 },
    );
  }
}
