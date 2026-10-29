import "server-only";

import { StorefrontConnectionUnavailable } from "./client-context";

export const STOREFRONT_RATE_LIMIT_MESSAGE = "Has realizado demasiados intentos. Espera un momento y vuelve a intentarlo.";

/** Only a bounded wait is retained; upstream bodies are never error messages. */
export class StorefrontRateLimited extends Error {
  readonly status = 429;
  readonly retryAfter: number;

  constructor(retryAfter: string | null) {
    super(STOREFRONT_RATE_LIMIT_MESSAGE);
    this.name = "StorefrontRateLimited";
    this.retryAfter = retryAfter !== null && /^\d{1,10}$/.test(retryAfter)
      ? Math.max(1, Math.min(3600, Number(retryAfter)))
      : 60;
  }
}

/** HTTP failures are distinct from commercial GraphQL errors in a 200 body. */
export function assertStorefrontHttpResponse(response: Response): void {
  if (response.status === 429) {
    throw new StorefrontRateLimited(response.headers.get("retry-after"));
  }
  if (!response.ok) throw new StorefrontConnectionUnavailable();
}
