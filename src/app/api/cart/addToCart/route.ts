import { CREATE_ADD_PRODUCT_IN_CART } from "@/graphql";
import { storefrontUnavailableResponse } from "@/utils/server/storefront-unavailable";
import { addToCartFailureResponse } from "@/utils/server/add-to-cart-error";
import { AddToCartOperation } from "@/types/cart/type";
import { bagistoFetch } from "@/utils/bagisto";
import { getAuthToken } from "@utils/helper";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const guestToken = getAuthToken(req);

    const variables = {
      cartId: body.cartId ?? null,
      productId: body.productId,
      quantity: body.quantity,
    };

    const res = await bagistoFetch<AddToCartOperation>({
      query: CREATE_ADD_PRODUCT_IN_CART,
      variables: variables,
      cache: "no-store",
      guestToken,
    });

    return Response.json({
      data: { ...res?.body.data },
    });
  } catch (error) {
    const unavailable = storefrontUnavailableResponse(error);
    if (unavailable) return unavailable;
    return addToCartFailureResponse(error);
  }
}

