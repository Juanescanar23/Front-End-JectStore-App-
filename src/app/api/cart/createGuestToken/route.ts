import { randomUUID } from "crypto";
import { bagistoFetch } from "@/utils/bagisto";

const CART_DETAIL_QUERY = `
  query CartDetailForGuestToken {
    cartDetail {
      id
      isGuest
    }
  }
`;

export async function POST() {
  let cartId = 0;
  let isGuest = true;

  try {
    const response = await bagistoFetch<any>({
      query: CART_DETAIL_QUERY,
      cache: "no-store",
    });

    cartId = Number(response?.body?.data?.cartDetail?.id ?? 0);
    isGuest = response?.body?.data?.cartDetail?.isGuest ?? true;
  } catch {
    // Compatibility token should still be issued for legacy callers.
  }

  const sessionToken = randomUUID();

  return Response.json({
    data: {
      createCartToken: {
        cartToken: {
          id: cartId > 0 ? cartId : 1,
          cartToken: sessionToken,
          customerId: null,
          success: true,
          message: "Guest session ready",
          sessionToken,
          isGuest,
        },
      },
    },
  });
}
