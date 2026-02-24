import { bagistoFetch } from "@/utils/bagisto";
import { isBagistoError } from "@/utils/type-guards";
import { normalizeLegacyCart } from "@/app/api/_lib/cart-compat";
import { withUpstreamCookie } from "@/app/api/_lib/upstream-cookie";

const ADD_ITEM_TO_CART_MUTATION = `
  mutation AddItemToCart($input: AddItemToCartInput!) {
    addItemToCart(input: $input) {
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

    const variables = {
      input: {
        productId: String(body.productId),
        quantity: Math.max(1, Number(body.quantity) || 1),
        ...(body.isBuyNow !== undefined
          ? { isBuyNow: Boolean(body.isBuyNow) }
          : {}),
      },
    };

    const response = await bagistoFetch<any>({
      query: ADD_ITEM_TO_CART_MUTATION,
      variables,
      cache: "no-store",
    });

    const payload = response?.body?.data?.addItemToCart;
    const legacyCart = normalizeLegacyCart(payload?.cart);

    const jsonResponse = Response.json({
      data: {
        createAddProductInCart: {
          addProductInCart: {
            ...(legacyCart ?? {}),
            success: Boolean(payload?.success),
            message: payload?.message ?? "",
            cartToken: null,
            sessionToken: null,
          },
        },
      },
    });

    return withUpstreamCookie(jsonResponse, response?.setCookie);
  } catch (error) {
    if (isBagistoError(error)) {
      return Response.json(
        {
          data: { createAddProductInCart: null },
          error: error,
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
