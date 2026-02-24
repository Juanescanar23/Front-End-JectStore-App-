import { bagistoFetch } from "@/utils/bagisto";
import { isBagistoError } from "@/utils/type-guards";
import { normalizeLegacyCart } from "@/app/api/_lib/cart-compat";

const CART_DETAIL_QUERY = `
  query CartDetailForMerge {
    cartDetail {
      id
      itemsCount
      itemsQty
      isGuest
      taxTotal
      shippingAmount
      subTotal
      grandTotal
      shippingMethod
      selectedShippingRate {
        method
        methodTitle
        methodDescription
      }
      payment {
        method
        methodTitle
      }
      items {
        id
        cartId
        productId
        name
        sku
        quantity
        type
        price
        product {
          urlKey
        }
      }
    }
  }
`;

export async function POST() {
  try {
    const response = await bagistoFetch<any>({
      query: CART_DETAIL_QUERY,
      cache: "no-store",
    });

    const legacyCart = normalizeLegacyCart(response?.body?.data?.cartDetail);

    return Response.json({
      data: {
        createMergeCart: {
          mergeCart: legacyCart,
        },
      },
    });
  } catch (error) {
    if (isBagistoError(error)) {
      return Response.json(
        {
          data: { createMergeCart: null },
          error,
        },
        { status: 200 },
      );
    }

    return Response.json(
      {
        message: "Network error",
        error: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
