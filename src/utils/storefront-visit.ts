export type StorefrontVisitDetails = {
  pageType: "home" | "product" | "category" | "page" | "search" | "cart" | "checkout";
  pageId?: string | number | null;
  term?: string | null;
  results?: number | null;
};

export function storefrontPageId(value: StorefrontVisitDetails["pageId"]): number | undefined {
  const match = String(value ?? "").match(/(?:^|\/)([1-9][0-9]*)$/);
  const id = match ? Number(match[1]) : 0;
  return Number.isSafeInteger(id) && id > 0 && id <= 4294967295 ? id : undefined;
}

function originOnly(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

/** The public Laravel endpoint resolves the tenant from this browser's host. */
export function storefrontVisitPayload(details: StorefrontVisitDetails, href: string, referrer: string) {
  const url = new URL(href);
  const id = storefrontPageId(details.pageId);
  const term = Array.from(details.term?.trim() || "").slice(0, 80).join("");
  return {
    path: Array.from(url.pathname).slice(0, 255).join(""),
    page_type: details.pageType,
    ...(["product", "category", "page"].includes(details.pageType) && id ? { page_id: id } : {}),
    referrer: originOnly(referrer),
    source: (url.searchParams.get("utm_source") || "").slice(0, 40) || undefined,
    ...(details.pageType === "search" && term ? {
      term,
      ...(typeof details.results === "number" && Number.isFinite(details.results)
        ? { results: Math.max(0, Math.min(100000, Math.floor(details.results))) } : {}),
    } : {}),
  };
}

let previousNavigation = "";
let previousOrigin = "";

/** One send per rendered navigation, including React Strict Mode remounts. */
export function reportStorefrontVisit(
  details: StorefrontVisitDetails,
  href: string,
  referrer: string,
  transport: typeof fetch = fetch,
): void {
  const url = new URL(href);
  const payload = storefrontVisitPayload(details, href, previousOrigin === url.origin ? previousOrigin : referrer);
  const body = JSON.stringify(payload);
  // Referrer changes after a send; do not let it defeat the navigation guard.
  const navigation = JSON.stringify([url.origin, payload.path, payload.page_type, payload.page_id, payload.term, payload.results]);
  if (navigation === previousNavigation) return;
  previousNavigation = navigation;
  previousOrigin = url.origin;
  // No customer/guest token, session cookie, signing material, or tenant ID.
  void transport("/api/storefront/visit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    credentials: "omit",
    mode: "same-origin",
    keepalive: true,
    redirect: "error",
  }).catch(() => { /* A metric never interrupts shopping. */ });
}
