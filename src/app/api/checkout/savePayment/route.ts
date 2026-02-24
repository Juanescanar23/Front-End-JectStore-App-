import { NextResponse } from "next/server";
import { bagistoFetch } from "@/utils/bagisto";
import { isBagistoError } from "@/utils/type-guards";

const SAVE_PAYMENT_MUTATION = `
  mutation SavePayment($input: savePaymentMethodInput!) {
    savePayment(input: $input) {
      message
      jumpToSection
      cart {
        id
        payment {
          method
          methodTitle
        }
      }
    }
  }
`;

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const response = await bagistoFetch<any>({
      query: SAVE_PAYMENT_MUTATION,
      variables: {
        input: {
          method: String(body?.paymentMethod ?? body?.method ?? ""),
        },
      },
      cache: "no-store",
    });

    const payload = response?.body?.data?.savePayment;

    return NextResponse.json(
      {
        data: {
          createCheckoutPaymentMethod: {
            checkoutPaymentMethod: {
              success: Boolean(payload),
              message: payload?.message ?? "",
              paymentGatewayUrl: null,
              paymentData: null,
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
