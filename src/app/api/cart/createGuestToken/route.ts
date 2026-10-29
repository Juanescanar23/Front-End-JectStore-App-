import { CREATE_CART_TOKEN } from "@/graphql";
import { storefrontUnavailableResponse } from "@/utils/server/storefront-unavailable";
import { CreateCartTokenOperation } from "@/types/cart/type";
import { bagistoFetch } from "@/utils/bagisto";
import { isBagistoError } from "@/utils/type-guards";


export async function POST() {
  try {
    const res = await bagistoFetch<{ data: CreateCartTokenOperation }>({
  query: CREATE_CART_TOKEN,
  cache: "no-store",
});


    return Response.json({
      data: { ...res?.body.data },
    });
  } catch (error) {
    const unavailable = storefrontUnavailableResponse(error);
    if (unavailable) return unavailable;
    if (isBagistoError(error)) {
      return Response.json(
        {
          data: { createCartToken: null },
          error,
        },
        { status: 200 }
      );
    }

    return Response.json({ error: "Server Error" }, { status: 500 });
  }
}
