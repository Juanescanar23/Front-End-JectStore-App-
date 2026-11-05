import "server-only";

const REJECTED_MESSAGE = "No pudimos agregar el producto. Revisa la cantidad e inténtalo de nuevo.";
const FAILED_MESSAGE = "No pudimos agregar el producto. Vuelve a intentarlo.";

/** Recognize only the JSON GraphQL error for this resolver, never a generic Error. */
function isAddToCartGraphqlError(error: unknown): boolean {
  try {
    if (typeof error !== "object" || error === null
      || Object.getPrototypeOf(error) !== Object.prototype) return false;

    // Do not invoke accessors on unknown thrown values. The HTTP JSON decoder
    // supplies data properties, not classes, getters or inherited authority.
    const message = Object.getOwnPropertyDescriptor(error, "message")?.value;
    const path = Object.getOwnPropertyDescriptor(error, "path")?.value;
    return typeof message === "string" && message.length > 0 && message.length <= 4096
      && Array.isArray(path) && Object.getPrototypeOf(path) === Array.prototype
      && path.length === 1
      && Object.getOwnPropertyDescriptor(path, "0")?.value === "createAddProductInCart";
  } catch {
    return false;
  }
}

/** No upstream text, extensions, traces, causes or session data reach the browser. */
export function addToCartFailureResponse(error: unknown): Response {
  const rejected = isAddToCartGraphqlError(error);
  return Response.json(
    {
      data: { createAddProductInCart: null },
      error: { message: rejected ? REJECTED_MESSAGE : FAILED_MESSAGE },
    },
    { status: rejected ? 200 : 500, headers: { "Cache-Control": "private, no-store" } },
  );
}
