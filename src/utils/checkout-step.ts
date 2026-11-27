export type CheckoutStep = "email" | "address" | "shipping" | "payment" | "review";

export function resolveCheckoutStep(step: string | null | undefined): CheckoutStep {
  switch (step) {
    case "address":
    case "shipping":
    case "payment":
    case "review":
      return step;
    default:
      return "email";
  }
}

/** Only the URL of the already-mounted checkout is changing, not the shop or cart. */
export function updateCheckoutStep(step: CheckoutStep, mode: "push" | "replace", whatsappOrder?: boolean): void {
  const url = new URL(window.location.href);
  if (url.pathname !== "/checkout" && url.pathname !== "/checkout/") return;
  if (url.searchParams.get("step") === step
    && (whatsappOrder === undefined || (url.searchParams.get("payment") === "whatsapp") === whatsappOrder)) return;

  url.searchParams.set("step", step);
  if (whatsappOrder === true) url.searchParams.set("payment", "whatsapp");
  if (whatsappOrder === false) url.searchParams.delete("payment");
  const target = url.pathname + url.search + url.hash;
  // The App Router integrates native history with useSearchParams. Do not
  // forward Next's private history state: it would bypass that integration.
  if (mode === "push") window.history.pushState(null, "", target);
  else window.history.replaceState(null, "", target);
}
