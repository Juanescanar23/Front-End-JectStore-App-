import { bagistoFetch } from "@/utils/bagisto";
import { isBagistoError } from "@/utils/type-guards";

const SAVE_CHECKOUT_ADDRESSES_MUTATION = `
  mutation SaveCheckoutAddresses($input: SaveShippingAddressInput!) {
    saveCheckoutAddresses(input: $input) {
      message
      jumpToSection
      cart {
        id
        itemsCount
        itemsQty
      }
      shippingMethods {
        title
        methods {
          code
          label
          price
          formattedPrice
        }
      }
      paymentMethods {
        method
        methodTitle
        description
        image
      }
    }
  }
`;

const normalizeAddress = (address: any, emailFallback = "", useForShipping?: boolean) => {
  const rawAddress = address?.address;

  return {
    firstName: String(address?.firstName ?? ""),
    lastName: String(address?.lastName ?? ""),
    email: String(address?.email ?? emailFallback ?? ""),
    companyName: String(address?.companyName ?? ""),
    address: Array.isArray(rawAddress)
      ? rawAddress.map((line) => String(line))
      : [String(rawAddress ?? "")],
    city: String(address?.city ?? ""),
    country: String(address?.country ?? ""),
    state: String(address?.state ?? ""),
    postcode: String(address?.postcode ?? ""),
    phone: String(address?.phone ?? ""),
    ...(typeof useForShipping === "boolean" ? { useForShipping } : {}),
  };
};

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const useForShipping =
      body?.useForShipping === undefined ? true : Boolean(body.useForShipping);

    const billingSource =
      body?.billing ??
      {
        firstName: body?.billingFirstName,
        lastName: body?.billingLastName,
        email: body?.billingEmail,
        companyName: body?.billingCompanyName,
        address: body?.billingAddress,
        city: body?.billingCity,
        country: body?.billingCountry,
        state: body?.billingState,
        postcode: body?.billingPostcode,
        phone: body?.billingPhoneNumber,
      };

    const shippingSource =
      body?.shipping ??
      {
        firstName: body?.shippingFirstName,
        lastName: body?.shippingLastName,
        email: body?.shippingEmail,
        companyName: body?.shippingCompanyName,
        address: body?.shippingAddress,
        city: body?.shippingCity,
        country: body?.shippingCountry,
        state: body?.shippingState,
        postcode: body?.shippingPostcode,
        phone: body?.shippingPhoneNumber,
      };

    const billing = normalizeAddress(
      billingSource,
      String(body?.billingEmail ?? body?.shippingEmail ?? ""),
      useForShipping,
    );

    const input: any = {
      billing,
    };

    if (!useForShipping) {
      input.shipping = normalizeAddress(
        shippingSource,
        String(body?.shippingEmail ?? body?.billingEmail ?? ""),
      );
    }

    const response = await bagistoFetch<any>({
      query: SAVE_CHECKOUT_ADDRESSES_MUTATION,
      variables: { input },
      cache: "no-store",
    });

    const payload = response?.body?.data?.saveCheckoutAddresses;

    return Response.json(
      {
        data: {
          createCheckoutAddress: {
            checkoutAddress: {
              success: Boolean(payload),
              message: payload?.message ?? "",
              id: Number(payload?.cart?.id ?? 0),
              cartToken: null,
            },
          },
          saveCheckoutAddresses: payload,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    if (isBagistoError(error)) {
      return Response.json(
        {
          data: { saveCheckoutAddresses: null },
          error,
        },
        { status: 200 },
      );
    }

    return Response.json(
      { error: "An unexpected error occurred." },
      { status: 500 },
    );
  }
}
