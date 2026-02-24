import { bagistoFetch } from "@/utils/bagisto";
import { flattenShippingMethods } from "@/app/api/_lib/cart-compat";

const SHIPPING_METHODS_QUERY = `
  query ShippingMethods {
    shippingMethods {
      message
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

export async function POST() {
  try {
    const response = await bagistoFetch<any>({
      query: SHIPPING_METHODS_QUERY,
      cache: "no-store",
    });

    const shippingGroups =
      response?.body?.data?.shippingMethods?.shippingMethods ?? [];

    return Response.json(
      {
        data: flattenShippingMethods(shippingGroups),
      },
      { status: 200 },
    );
  } catch (error) {
    return Response.json(
      {
        message: "Error querying the GraphQL API",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
