import { CREATE_MERGE_CART } from "@/graphql";
import { storefrontUnavailableResponse } from "@/utils/server/storefront-unavailable";
import { bagistoFetch } from "@/utils/bagisto";
import { isBagistoError } from "@/utils/type-guards";
import { CreateMergeCartOperation } from "@/types/cart/type";
import { getAuthToken } from "@/utils/helper";

const message = "No se pudo unir el carrito. Intenta de nuevo.";
const responseHeaders = { "Cache-Control": "private, no-store" };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (
      !body || typeof body !== "object" || Array.isArray(body) ||
      !Number.isInteger(body.cartId) || body.cartId <= 0 || body.cartId > 2147483647 ||
      typeof body.guestCartToken !== "string" || !body.guestCartToken.trim() ||
      new TextEncoder().encode(body.guestCartToken).byteLength > 4096
    ) {
      return Response.json({ message }, { status: 400, headers: responseHeaders });
    }
    const customerToken = getAuthToken(req);

    const variables = {
      cartId: body.cartId,
      guestCartToken: body.guestCartToken,
    };

    const res = await bagistoFetch<CreateMergeCartOperation>({
      query: CREATE_MERGE_CART,
      variables: variables,
      cache: "no-store",
      guestToken: customerToken,
    });

    return Response.json({
      data: { ...res?.body.data },
    }, { headers: responseHeaders });
  } catch (error) {
    const unavailable = storefrontUnavailableResponse(error);
    if (unavailable) return unavailable;
    if (isBagistoError(error)) {
      return Response.json(
        {
          data: { createMergeCart: null },
          message,
        },
        { status: 200, headers: responseHeaders }
      );
    }

    return Response.json(
      {
        message,
      },
      { status: 500, headers: responseHeaders }
    );
  }
}

