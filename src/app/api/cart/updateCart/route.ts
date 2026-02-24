import { bagistoFetch } from "@/utils/bagisto";
import { isBagistoError } from "@/utils/type-guards";
import { normalizeLegacyCart } from "@/app/api/_lib/cart-compat";

const UPDATE_ITEM_TO_CART_MUTATION = `
  mutation UpdateItemToCart($input: UpdateItemToCartInput!) {
    updateItemToCart(input: $input) {
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
      query: UPDATE_ITEM_TO_CART_MUTATION,
      variables: {
        input: {
          qty: [
            {
              cartItemId: String(body.cartItemId ?? ""),
              quantity: Math.max(1, Number(body.quantity) || 1),
            },
          ],
        },
      },
      cache: "no-store",
    });

    const payload = response?.body?.data?.updateItemToCart;
    const legacyCart = normalizeLegacyCart(payload?.cart);

    return Response.json({
      data: {
        createUpdateCartItem: {
          updateCartItem: legacyCart,
        },
      },
    });
  } catch (error) {
    if (isBagistoError(error)) {
      return Response.json(
        {
          data: { createUpdateCartItem: null },
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
