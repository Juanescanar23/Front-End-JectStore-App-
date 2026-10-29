import "server-only";

import { StorefrontConnectionUnavailable } from "./client-context";
import { STOREFRONT_RATE_LIMIT_MESSAGE, StorefrontRateLimited } from "./storefront-http-error";

/** Recognize only safe transport types, not commercial GraphQL validation. */
export function storefrontUnavailableResponse(error: unknown): Response | null {
  if (error instanceof StorefrontRateLimited) {
    return Response.json(
      { message: STOREFRONT_RATE_LIMIT_MESSAGE, retry_after: error.retryAfter },
      {
        status: 429,
        headers: { "Cache-Control": "private, no-store", "Retry-After": String(error.retryAfter) },
      },
    );
  }
  if (!(error instanceof StorefrontConnectionUnavailable)) return null;

  return Response.json(
    { message: "No pudimos conectar con la tienda. Vuelve a intentarlo." },
    {
      status: 503,
      headers: { "Cache-Control": "private, no-store", "Retry-After": "5" },
    },
  );
}
