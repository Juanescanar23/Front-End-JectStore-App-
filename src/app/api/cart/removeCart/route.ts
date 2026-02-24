import { bagistoFetch } from "@/utils/bagisto";
import { isBagistoError } from "@/utils/type-guards";
import { normalizeLegacyCart } from "@/app/api/_lib/cart-compat";

const REMOVE_CART_ITEM_MUTATION = `
  mutation RemoveCartItem($id: ID!) {
    removeCartItem(id: $id) {
      success
      message
      cart {
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
  }
`;

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const response = await bagistoFetch<any>({
      query: REMOVE_CART_ITEM_MUTATION,
      variables: {
        id: String(body.cartItemId ?? ""),
      },
      cache: "no-store",
    });

    const payload = response?.body?.data?.removeCartItem;
    const legacyCart = normalizeLegacyCart(payload?.cart);

    return Response.json({
      data: {
        createRemoveCartItem: {
          success: Boolean(payload?.success),
          message: payload?.message ?? "",
          removeCartItem: legacyCart,
        },
      },
    });
  } catch (error) {
    if (isBagistoError(error)) {
      return Response.json(
        {
          data: { createRemoveCartItem: null },
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
